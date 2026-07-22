import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "../_lib/auth";
import { capture } from "../_lib/store";
import { CRITERIA, DEFAULT_CRITERIA_ID, getCriterion } from "../_lib/criteria";
import type { ToolScoreRequest, ToolScoreResult } from "../_lib/types";

// Star Wars lore keywords used for a fast heuristic check
const LORE_KEYWORDS =
  /\b(sith|jedi|force|lightsaber|padawan|wookiee|droid|empire|rebel|clone|hutt|mandalorian|blaster|hyperspace|midi-chlorian|holocron|republic|separatist|apprentice|master|dark.?side|light.?side)\b/i;

// Patterns that indicate a non-answer from the chatbot
const VAGUE_ANSWER =
  /^(yes|no|ok|sure|maybe|i (don't|do not) know|unclear|unknown|n\/a)\.?$/i;

function scoreText(
  text: string,
  criteriaId: string
): Omit<ToolScoreResult, "source" | "criteria"> {
  const criterion = getCriterion(criteriaId);
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const isVague = VAGUE_ANSWER.test(trimmed) || wordCount <= 2;

  if (isVague) {
    return {
      label: "fail",
      score: criterion.failScore,
      rationale: `Response is too vague to evaluate for ${criterion.label}. ${criterion.failRationale}`,
    };
  }

  // Criteria-specific heuristics
  switch (criteriaId) {
    case "lore_accuracy":
    case "hallucination": {
      // Heuristic: response that references known lore terms is more likely grounded
      const hasLore = LORE_KEYWORDS.test(trimmed);
      return {
        label: hasLore ? "pass" : "fail",
        score: hasLore ? criterion.passScore : criterion.failScore,
        rationale: hasLore
          ? criterion.passRationale
          : `${criterion.failRationale} No recognizable Star Wars terminology found.`,
      };
    }

    case "in_character": {
      // Heuristic: look for out-of-character signals
      const breaksCharacter =
        /\b(as an ai|i am a (language model|chatbot|assistant)|i cannot|i am unable)\b/i.test(
          trimmed
        );
      return {
        label: breaksCharacter ? "fail" : "pass",
        score: breaksCharacter ? criterion.failScore : criterion.passScore,
        rationale: breaksCharacter
          ? criterion.failRationale
          : criterion.passRationale,
      };
    }

    case "relevance":
    default: {
      // Heuristic: substantive length + lore context implies relevance
      const substantive = wordCount > 5 && LORE_KEYWORDS.test(trimmed);
      return {
        label: substantive ? "pass" : "fail",
        score: substantive ? criterion.passScore : criterion.failScore,
        rationale: substantive
          ? criterion.passRationale
          : criterion.failRationale,
      };
    }
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as ToolScoreRequest;
  const text = String(body.text ?? "");
  const rawCriteria = String(body.criteria ?? DEFAULT_CRITERIA_ID).toLowerCase();
  const criteriaId = CRITERIA[rawCriteria] ? rawCriteria : DEFAULT_CRITERIA_ID;
  const recordId = String(body.record_id ?? "");

  if (!text) {
    res.status(400).json({ error: "Missing required field: text" });
    return;
  }

  const { label, score, rationale } = scoreText(text, criteriaId);

  const result: ToolScoreResult = {
    label,
    score,
    rationale,
    source: "arize-test-eval-api/tool/score",
    criteria: criteriaId,
  };

  console.log(
    `[tool/score] criteria=${criteriaId} record_id=${recordId} label=${label} score=${score}`
  );

  capture({
    ts: new Date().toISOString(),
    endpoint: "/tool/score",
    mode: "tool",
    recordId,
    input: { text, criteria: criteriaId },
    responseStatus: 200,
    responseBody: result,
  }).catch(() => undefined);

  res.status(200).json(result);
}

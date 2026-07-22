import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "../_lib/auth";
import { capture } from "../_lib/store";
import type { ToolScoreRequest, ToolScoreResult } from "../_lib/types";

const CRITERIA_RUBRICS: Record<
  string,
  { pass: string; fail: string; passScore: number; failScore: number }
> = {
  helpfulness: {
    pass: "Response is actionable and directly addresses the request.",
    fail: "Response is vague or does not address the request.",
    passScore: 0.9,
    failScore: 0.2,
  },
  relevance: {
    pass: "Response is on-topic and pertinent to the input.",
    fail: "Response diverges from the topic.",
    passScore: 0.85,
    failScore: 0.15,
  },
  accuracy: {
    pass: "Response appears factually correct.",
    fail: "Response contains suspect or incorrect information.",
    passScore: 0.8,
    failScore: 0.1,
  },
  tone: {
    pass: "Response uses a professional and appropriate tone.",
    fail: "Response tone is inappropriate or unprofessional.",
    passScore: 0.95,
    failScore: 0.3,
  },
};

function scoreText(
  text: string,
  criteria: string
): Omit<ToolScoreResult, "source" | "criteria"> {
  const rubric = CRITERIA_RUBRICS[criteria] ?? CRITERIA_RUBRICS.helpfulness;
  const wordCount = text.trim().split(/\s+/).length;

  // Heuristic: longer responses with substantive content tend to score higher
  const hasContent = wordCount > 5;
  const isVague = /^(yes|no|ok|sure|maybe|i don't know)\.?$/i.test(
    text.trim()
  );

  const pass = hasContent && !isVague;
  return {
    label: pass ? "pass" : "fail",
    score: pass ? rubric.passScore : rubric.failScore,
    rationale: pass ? rubric.pass : rubric.fail,
  };
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
  const criteria = String(body.criteria ?? "helpfulness").toLowerCase();
  const recordId = String(body.record_id ?? "");

  if (!text) {
    res.status(400).json({ error: "Missing required field: text" });
    return;
  }

  const { label, score, rationale } = scoreText(text, criteria);

  const result: ToolScoreResult = {
    label,
    score,
    rationale,
    source: "arize-test-eval-api/tool/score",
    criteria,
  };

  console.log(
    `[tool/score] criteria=${criteria} record_id=${recordId} label=${label} score=${score}`
  );

  capture({
    ts: new Date().toISOString(),
    endpoint: "/tool/score",
    mode: "tool",
    recordId,
    input: { text, criteria },
    responseStatus: 200,
    responseBody: result,
  }).catch(() => undefined);

  res.status(200).json(result);
}

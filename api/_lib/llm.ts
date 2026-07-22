import type { EvalResult } from "./types";
import { getCriterion, DEFAULT_CRITERIA_ID } from "./criteria";

interface LLMConfig {
  provider: "openai" | "anthropic";
  model: string;
}

function getLLMConfig(): LLMConfig {
  const provider =
    (process.env.LLM_PROVIDER as "openai" | "anthropic") ?? "openai";

  const defaultModel =
    provider === "anthropic" ? "claude-3-haiku-20240307" : "gpt-4o-mini";

  return { provider, model: process.env.LLM_MODEL ?? defaultModel };
}

function buildSystemPrompt(criteriaId: string): string {
  const criterion = getCriterion(criteriaId);
  return `You are an expert Star Wars canon judge evaluating a chatbot's response.

Criterion: ${criterion.label}
Task: ${criterion.judgeInstruction}

Return ONLY a JSON object with exactly these fields:
- label: "pass" or "fail"
- score: float between 0 and 1 (1 = perfect, 0 = completely wrong)
- explanation: one concise sentence explaining your verdict, referencing specific Star Wars details where relevant

No other text outside the JSON object.`;
}

async function callOpenAI(
  input: Record<string, unknown>,
  model: string,
  systemPrompt: string
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Chatbot exchange to evaluate:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      max_tokens: 250,
    }),
  });
}

async function callAnthropic(
  input: Record<string, unknown>,
  model: string,
  systemPrompt: string
): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Chatbot exchange to evaluate:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      max_tokens: 250,
    }),
  });
}

function parseVerdict(raw: string): EvalResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object found in LLM response");

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  return {
    label: typeof parsed.label === "string" ? parsed.label : undefined,
    score: typeof parsed.score === "number" ? parsed.score : undefined,
    explanation:
      typeof parsed.explanation === "string" ? parsed.explanation : undefined,
  };
}

/**
 * Calls the configured LLM provider and returns a parsed EvalResult.
 * criteriaId selects the Star Wars judge prompt; defaults to lore_accuracy.
 * Throws on provider errors; callers should map to 5xx.
 */
export async function runLLMEval(
  input: Record<string, unknown>,
  criteriaId: string = DEFAULT_CRITERIA_ID
): Promise<EvalResult> {
  const { provider, model } = getLLMConfig();
  const systemPrompt = buildSystemPrompt(criteriaId);

  let response: Response;
  if (provider === "anthropic") {
    response = await callAnthropic(input, model, systemPrompt);
  } else {
    response = await callOpenAI(input, model, systemPrompt);
  }

  if (response.status === 429) {
    const err = new Error("LLM provider rate limited");
    (err as NodeJS.ErrnoException).code = "RATE_LIMITED";
    throw err;
  }

  if (!response.ok) {
    throw new Error(`LLM provider error: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  let rawText: string;
  if (provider === "anthropic") {
    const content = data.content as Array<{ type: string; text: string }>;
    rawText = content?.[0]?.text ?? "";
  } else {
    const choices = data.choices as Array<{ message: { content: string } }>;
    rawText = choices?.[0]?.message?.content ?? "";
  }

  return parseVerdict(rawText);
}

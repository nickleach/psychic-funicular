import type { IncomingMessage } from "http";
import type { ModeResult } from "./types";
import { runLLMEval } from "./llm";

const DELIVERY_KEYWORDS =
  /\b(deliver|delivery|uber\s*eats|doordash|grubhub|pickup|takeout|take.?out|ship|shipping)\b/i;

/**
 * Resolve the active test-mode string from (in priority order):
 *  1. ?mode= query param
 *  2. x-test-mode header
 *  3. metadata.evaluator prefix (e.g. "stub-pass::my-evaluator" or just "stub-pass")
 */
export function resolveMode(
  req: IncomingMessage,
  evaluatorName?: string
): string {
  const url = new URL(req.url ?? "/", "http://localhost");
  const qmode = url.searchParams.get("mode");
  if (qmode) return qmode.toLowerCase();

  const hmode = req.headers["x-test-mode"];
  if (typeof hmode === "string" && hmode) return hmode.toLowerCase();

  if (evaluatorName) {
    const lower = evaluatorName.toLowerCase();
    // Support "stub-pass::my-real-evaluator-name" to embed mode in evaluator name
    const colonIdx = lower.indexOf("::");
    const candidate = colonIdx >= 0 ? lower.slice(0, colonIdx) : lower;
    if (isKnownMode(candidate)) return candidate;
  }

  return "keyword";
}

function isKnownMode(s: string): boolean {
  if (
    ["stub-pass", "stub-fail", "keyword", "llm", "no-verdict"].includes(s)
  ) {
    return true;
  }
  if (
    ["force-401", "force-403", "force-429", "force-500", "force-400"].includes(
      s
    )
  ) {
    return true;
  }
  if (/^slow-\d+$/.test(s)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keywordScore(input: Record<string, unknown>): ModeResult {
  const text = String(input.output ?? input.response ?? input.answer ?? "");
  const match = DELIVERY_KEYWORDS.test(text);
  return {
    status: 200,
    body: {
      label: match ? "pass" : "fail",
      score: match ? 1 : 0,
      explanation: match
        ? "Output contains a delivery-related term."
        : "Output does not mention delivery.",
    },
  };
}

/**
 * Execute the resolved mode and return { status, body }.
 * The caller (handler) is responsible for writing the HTTP response.
 */
export async function executeMode(
  mode: string,
  input: Record<string, unknown>
): Promise<ModeResult> {
  // Force specific status codes to exercise Arize retry/backoff/fatal paths
  if (mode === "force-401") {
    return { status: 401, body: { label: "error", score: 0, explanation: "forced 401" } };
  }
  if (mode === "force-403") {
    return { status: 403, body: { label: "error", score: 0, explanation: "forced 403" } };
  }
  if (mode === "force-429") {
    return { status: 429, body: { label: "error", score: 0, explanation: "forced 429 rate limit" } };
  }
  if (mode === "force-500") {
    return { status: 500, body: { label: "error", score: 0, explanation: "forced 500 transient error" } };
  }
  if (mode === "force-400") {
    return { status: 400, body: { label: "error", score: 0, explanation: "forced 400 record failure" } };
  }

  // Delay to test timeouts and cold-start warmup
  const slowMatch = mode.match(/^slow-(\d+)$/);
  if (slowMatch) {
    const ms = Math.min(parseInt(slowMatch[1], 10), 25000);
    await sleep(ms);
    return {
      status: 200,
      body: {
        label: "pass",
        score: 1,
        explanation: `Responded after ${ms}ms delay.`,
      },
    };
  }

  if (mode === "stub-pass") {
    return {
      status: 200,
      body: { label: "pass", score: 1, explanation: "stub: always pass" },
    };
  }

  if (mode === "stub-fail") {
    return {
      status: 200,
      body: { label: "fail", score: 0, explanation: "stub: always fail" },
    };
  }

  if (mode === "no-verdict") {
    // 2xx with neither label nor score — Arize treats this as a record failure
    return { status: 200, body: {} };
  }

  if (mode === "llm") {
    try {
      const result = await runLLMEval(input);
      return { status: 200, body: result };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "RATE_LIMITED") {
        return {
          status: 429,
          body: { label: "error", score: 0, explanation: "LLM provider rate limited" },
        };
      }
      console.error("LLM eval error:", err);
      return {
        status: 500,
        body: { label: "error", score: 0, explanation: "LLM provider error" },
      };
    }
  }

  // Default: rule-based keyword scoring
  return keywordScore(input);
}

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  // Report presence of config without revealing whether auth is absent —
  // avoid advertising "auth_enabled: false" to unauthenticated callers.
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasKV = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );

  res.status(200).json({
    status: "ok",
    ts: new Date().toISOString(),
    config: {
      llm_provider: process.env.LLM_PROVIDER ?? "openai",
      llm_model:
        process.env.LLM_MODEL ??
        (process.env.LLM_PROVIDER === "anthropic"
          ? "claude-3-haiku-20240307"
          : "gpt-4o-mini"),
      llm_ready: hasOpenAI || hasAnthropic,
      kv_store: hasKV ? "upstash" : "in-memory",
    },
    endpoints: [
      "POST /evaluate  — Arize remote-evaluator contract",
      "POST /tool/score — Agent-as-a-Judge skill tool",
      "GET  /health    — this endpoint",
      "GET  /requests  — debug capture buffer",
    ],
    modes: [
      "keyword (default) — rule-based regex scoring",
      "stub-pass        — always return pass/1",
      "stub-fail        — always return fail/0",
      "llm              — real OpenAI or Anthropic call",
      "no-verdict       — 200 {} (Arize failure path)",
      "force-401/403    — auth fatal paths",
      "force-429        — rate-limit backoff path",
      "force-500        — transient retry path",
      "force-400        — record failure path",
      "slow-<ms>        — delay response (timeout testing)",
    ],
  });
}

import type { CapturedRequest } from "./types";

const RING_SIZE = 50;

// In-memory ring buffer — best-effort per warm Vercel instance.
// Falls back gracefully; no crash if the instance is cold.
const ring: CapturedRequest[] = [];

async function upstashPush(entry: CapturedRequest): Promise<void> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;

  // LPUSH + LTRIM keeps a capped list in Redis
  await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["LPUSH", "eval:requests", JSON.stringify(entry)],
      ["LTRIM", "eval:requests", 0, RING_SIZE - 1],
    ]),
  });
}

async function upstashList(): Promise<CapturedRequest[] | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}/lrange/eval:requests/0/${RING_SIZE - 1}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { result?: string[] };
  return (data.result ?? []).map((s) => JSON.parse(s) as CapturedRequest);
}

export async function capture(entry: CapturedRequest): Promise<void> {
  ring.unshift(entry);
  if (ring.length > RING_SIZE) ring.length = RING_SIZE;

  // Fire-and-forget to Upstash if configured; don't await on the hot path
  upstashPush(entry).catch(() => undefined);
}

export async function list(): Promise<CapturedRequest[]> {
  const kvEntries = await upstashList();
  // Prefer Upstash if available; fall back to in-memory ring
  return kvEntries ?? [...ring];
}

export async function clear(): Promise<void> {
  ring.length = 0;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;

  await fetch(`${url}/del/eval:requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

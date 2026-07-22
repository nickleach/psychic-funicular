import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "./_lib/auth";
import { list, clear } from "./_lib/store";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // /requests stores raw span input/output — always require auth
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // DELETE clears the buffer (useful between test runs)
  if (req.method === "DELETE") {
    await clear();
    res.status(200).json({ cleared: true });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const entries = await list();

  res.status(200).json({
    count: entries.length,
    note: process.env.KV_REST_API_URL
      ? "backed by Upstash KV (durable across instances)"
      : "in-memory ring buffer — resets on cold start; set KV_REST_API_URL for durability",
    requests: entries,
  });
}

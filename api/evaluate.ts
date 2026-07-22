import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "./_lib/auth";
import { resolveMode, executeMode } from "./_lib/modes";
import { capture } from "./_lib/store";
import type { ArizeEvalRequest } from "./_lib/types";

async function readBody(req: VercelRequest): Promise<unknown> {
  // Vercel's node runtime parses JSON bodies automatically
  if (req.body !== undefined) return req.body;

  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Auth check
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawBody = (await readBody(req)) as Partial<ArizeEvalRequest>;

  const metadata = rawBody.metadata ?? {
    request_id: "unknown",
    evaluator: "",
    record_id: "unknown",
  };
  const input = rawBody.input ?? {};

  const mode = resolveMode(req, metadata.evaluator);

  console.log(
    `[evaluate] mode=${mode} evaluator=${metadata.evaluator} request_id=${metadata.request_id} record_id=${metadata.record_id}`
  );

  const { status, body } = await executeMode(mode, input);

  // Capture to debug store (fire-and-forget)
  capture({
    ts: new Date().toISOString(),
    endpoint: "/evaluate",
    mode,
    requestId: metadata.request_id,
    evaluator: metadata.evaluator,
    recordId: metadata.record_id,
    input,
    responseStatus: status,
    responseBody: body,
  }).catch(() => undefined);

  res.status(status).json(body);
}

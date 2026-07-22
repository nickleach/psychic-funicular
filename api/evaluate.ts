import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "./_lib/auth";
import { resolveMode, executeMode } from "./_lib/modes";
import { capture } from "./_lib/store";
import type { ArizeEvalRequest } from "./_lib/types";

const MAX_BODY_BYTES = 1024 * 512; // 512 KB — well within Vercel's 4.5 MB infra limit

async function readBody(req: VercelRequest): Promise<unknown> {
  // Vercel's node runtime parses JSON bodies automatically
  if (req.body !== undefined) return req.body;

  return new Promise((resolve, reject) => {
    let data = "";
    let byteCount = 0;
    req.on("data", (chunk: Buffer | string) => {
      byteCount += Buffer.byteLength(chunk);
      if (byteCount > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
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

  let rawBody: Partial<ArizeEvalRequest>;
  try {
    rawBody = (await readBody(req)) as Partial<ArizeEvalRequest>;
  } catch {
    res.status(413).json({ error: "Request body too large" });
    return;
  }

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

  const { status, body } = await executeMode(mode, input, req, metadata.evaluator);

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

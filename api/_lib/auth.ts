import type { IncomingMessage } from "http";

/**
 * Returns true if the request passes auth.
 * When EVAL_AUTH_TOKEN is not set, all requests are allowed through.
 * When it is set, the request must carry Authorization: Bearer <token>.
 */
export function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.EVAL_AUTH_TOKEN;
  if (!expected) return true;

  const header = req.headers["authorization"] ?? "";
  return header === `Bearer ${expected}`;
}

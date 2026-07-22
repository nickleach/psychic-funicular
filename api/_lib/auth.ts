import type { IncomingMessage } from "http";
import { timingSafeEqual } from "crypto";

/**
 * Returns true if the request passes auth.
 * When EVAL_AUTH_TOKEN is not set, all requests are allowed through.
 * When it is set, the request must carry Authorization: Bearer <token>.
 * Uses timingSafeEqual to prevent timing-based token oracle attacks.
 */
export function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.EVAL_AUTH_TOKEN;
  if (!expected) return true;

  const header = req.headers["authorization"] ?? "";
  const expectedHeader = `Bearer ${expected}`;

  // Buffers must be the same length for timingSafeEqual; pad to avoid length leak
  const a = Buffer.from(header.padEnd(expectedHeader.length, "\0"));
  const b = Buffer.from(expectedHeader.padEnd(header.length, "\0"));
  // Both buffers are padded to max(a,b) length — compare equal-length slices
  const maxLen = Math.max(a.length, b.length);
  const aBuf = Buffer.alloc(maxLen);
  const bBuf = Buffer.alloc(maxLen);
  a.copy(aBuf);
  b.copy(bBuf);

  return timingSafeEqual(aBuf, bBuf);
}

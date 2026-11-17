// Short-lived HMAC signatures for server-to-server calls inside this app (e.g.
// the PDF route asking the poster job to process one inspection). Signed with
// the service-role key, which never leaves the server; the request carries
// only the signature and expiry.

import { createHmac, timingSafeEqual } from "crypto";

function key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function mac(purpose: string, subject: string, exp: number) {
  return createHmac("sha256", key()).update(`${purpose}:${subject}:${exp}`).digest("base64url");
}

export function signInternal(purpose: string, subject: string, ttlSeconds = 300, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { exp, sig: mac(purpose, subject, exp) };
}

export function verifyInternal(
  purpose: string,
  subject: string,
  exp: unknown,
  sig: unknown,
  now = Date.now(),
): boolean {
  if (!key()) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(mac(purpose, subject, expNum));
  const given = Buffer.from(String(sig || ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

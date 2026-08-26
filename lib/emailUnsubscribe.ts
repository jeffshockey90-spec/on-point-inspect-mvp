import { createHmac, timingSafeEqual } from "crypto";

// Secret for signing self-verifying unsubscribe tokens. Reuses the service-role
// key (always set, server-only, never exposed) so no new env var is required;
// set UNSUBSCRIBE_SECRET to override.
const SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "flow-unsubscribe-fallback-secret";

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://app.flowinspect.app").replace(/\/$/, "");
}

function normalize(email: string) {
  return String(email || "").toLowerCase().trim();
}

function sign(email: string) {
  return createHmac("sha256", SECRET).update(normalize(email)).digest("base64url");
}

/** A signed, self-verifying unsubscribe token for an email address. */
export function unsubscribeToken(email: string): string {
  const e = normalize(email);
  return `${Buffer.from(e).toString("base64url")}.${sign(e)}`;
}

/** Returns the email if the token is valid, else null. */
export function verifyUnsubscribeToken(token: string): string | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;

  let email = "";
  try {
    email = Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email) return null;

  const expected = Buffer.from(sign(email));
  const provided = Buffer.from(parts[1]);
  if (expected.length !== provided.length) return null;
  try {
    if (!timingSafeEqual(expected, provided)) return null;
  } catch {
    return null;
  }
  return email;
}

/**
 * RFC 8058 one-click List-Unsubscribe headers. Yahoo and Gmail weight these
 * heavily for inbox placement. Spread the result into `resend.emails.send({ ... })`
 * via its `headers` option. Returns {} for a blank recipient.
 */
export function listUnsubscribeHeaders(email: string): Record<string, string> {
  const to = normalize(email);
  if (!to) return {};
  const url = `${appBaseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(to))}`;
  return {
    "List-Unsubscribe": `<${url}>, <mailto:unsubscribe@onpointhomeinspect.com?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * True if the recipient has unsubscribed. Call before sending NON-essential mail
 * (reminders, follow-ups); the one-time transactional delivery a client asked for
 * (their report, agreement, invoice) should still send. `admin` is a service-role
 * Supabase client. Fails open (returns false) so a lookup error never blocks mail.
 */
export async function isEmailUnsubscribed(admin: any, email: string): Promise<boolean> {
  const e = normalize(email);
  if (!e) return false;
  try {
    const { data } = await admin
      .from("email_unsubscribes")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

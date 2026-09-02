// Shared bits for the optional, per-inspector insurance-agent referral shown in
// the client portal. Config lives in insurance_referral_settings (keyed by the
// inspector's user_id) so it never leaks across inspectors/companies. Leads are
// logged in insurance_referral_leads. Nothing is sent/opened without explicit
// client consent — see the opt-in route.

export const INSURANCE_CONSENT_TEXT =
  "I'd like my inspector's insurance agent to help me with home insurance for this property. " +
  "I consent to sharing my name and contact details with them for this purpose. " +
  "I understand this is optional and separate from my home inspection.";

// Resolve an inspection strictly by its share token (never a raw id). Tries all
// token columns since older links may use a legacy one. Returns null on miss so
// callers 404 without distinguishing a bad token from a raw id.
export async function resolveInspectionByToken(
  db: { from: (t: string) => any },
  lookup: string,
): Promise<any | null> {
  const token = String(lookup || "").trim();
  if (!token) return null;
  for (const col of ["public_share_token", "share_token", "report_share_token"]) {
    const { data } = await db.from("inspections").select("*").eq(col, token).maybeSingle();
    if (data?.id) return data;
  }
  return null;
}

// Normalize a user-entered agent link into a safe absolute http(s) URL, or null.
export function normalizeAgentLink(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

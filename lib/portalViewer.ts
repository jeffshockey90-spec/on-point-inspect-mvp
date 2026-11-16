import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Who the signed-in user is relative to an inspection, for the no-login client
// surfaces that also accept a raw inspection id from a signed-in user:
//   "staff"  – the owning inspector or a member of the owning company
//   "client" – a client contact on the inspection (matched by email)
//   null     – not signed in, or no relationship (no access by raw id)
export type PortalViewerRole = "staff" | "client" | null;

export type SessionUser = { id: string; email?: string | null };

export async function resolvePortalViewerRole(
  admin: { from: (t: string) => any },
  inspection: { id?: unknown; inspector_id?: unknown; company_id?: unknown } | null | undefined,
  user: SessionUser | null | undefined,
): Promise<PortalViewerRole> {
  if (!user?.id || !inspection) return null;

  if (String(inspection.inspector_id || "") === user.id) return "staff";

  if (inspection.company_id) {
    const { data: membership } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("company_id", inspection.company_id)
      .maybeSingle();
    if (membership) return "staff";
  }

  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    const { data: contact } = await admin
      .from("inspection_contacts")
      .select("id")
      .eq("inspection_id", inspection.id)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (contact) return "client";
  }

  return null;
}

/** The signed-in user from the request cookies, or null. Never throws. */
export async function getCookieSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll() {} } },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser();
    return user ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}

export type CardInspection = {
  inspection: any | null;
  viewerRole: PortalViewerRole;
  /** True when found by raw inspection id (portal opened by id), not a share token. */
  viaRawId: boolean;
};

/**
 * Resolve the inspection behind an optional client card (social release,
 * Secure24, insurance referral). A share token always works (no login). A raw
 * numeric id works ONLY for a signed-in user tied to the inspection: the portal
 * opened by id withholds the token on undelivered reports, so without this the
 * cards silently never showed there. Anonymous raw-id lookups get nothing, so
 * ids still can't be enumerated.
 */
export async function resolveCardInspection(
  db: { from: (t: string) => any },
  lookup: string,
  getUser: () => Promise<SessionUser | null> = getCookieSessionUser,
): Promise<CardInspection> {
  const none: CardInspection = { inspection: null, viewerRole: null, viaRawId: false };
  const value = String(lookup || "").trim();
  if (!value) return none;

  for (const col of ["public_share_token", "share_token", "report_share_token"]) {
    const { data } = await db.from("inspections").select("*").eq(col, value).maybeSingle();
    if (data?.id) return { inspection: data, viewerRole: null, viaRawId: false };
  }

  if (!/^\d+$/.test(value)) return none;
  const { data: candidate } = await db.from("inspections").select("*").eq("id", value).maybeSingle();
  if (!candidate?.id) return none;
  const viewerRole = await resolvePortalViewerRole(db, candidate, await getUser());
  return viewerRole ? { inspection: candidate, viewerRole, viaRawId: true } : none;
}

/** Staff opening a client card by raw id see it read-only (never act for the client). */
export function isStaffPreview(r: CardInspection): boolean {
  return r.viaRawId && r.viewerRole === "staff";
}

/** Only a signed-in client may act on a client card reached by raw id. */
export function canActOnCard(r: CardInspection): boolean {
  return Boolean(r.inspection?.id) && (!r.viaRawId || r.viewerRole === "client");
}

/**
 * Agreement signing reached by RAW inspection id (legacy links, no share
 * token). Mirrors the signing page's rule: allowed only when the link carries a
 * contact id that belongs to this inspection (a per-recipient secret), or the
 * signed-in user is tied to the inspection (inspector/company, or the client).
 * A bare guessed id with neither is refused, so signatures can't be forged.
 */
export async function canSignByRawId(
  db: { from: (t: string) => any },
  inspection: { id?: unknown; inspector_id?: unknown; company_id?: unknown } | null | undefined,
  contactId: string,
  getUser: () => Promise<SessionUser | null> = getCookieSessionUser,
): Promise<boolean> {
  if (!inspection?.id) return false;
  if (contactId) {
    const { data } = await db
      .from("inspection_contacts")
      .select("id")
      .eq("id", contactId)
      .eq("inspection_id", inspection.id)
      .maybeSingle();
    if (data?.id) return true;
  }
  return (await resolvePortalViewerRole(db, inspection, await getUser())) !== null;
}

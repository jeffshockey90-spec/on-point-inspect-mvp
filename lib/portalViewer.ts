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

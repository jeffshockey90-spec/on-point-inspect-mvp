// Shared authentication + inspection-ownership guard for API routes.
//
// Many routes historically used the service-role client (which bypasses RLS)
// with no auth check, because the middleware treats all /api paths as public.
// These helpers give those routes a consistent gate: confirm there is a signed
// -in user, then confirm that user may act on the target inspection (company
// owners get their whole team via resolveInspectionAccessFilter).
import { NextResponse } from "next/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../utils/supabase/server";
import { resolveInspectionAccessFilter } from "./inspectionAccess";

export function getAdminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Returns the authenticated user, or null if the request has no valid session.
export async function getSessionUser() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in required." }, { status: 401 });
}

// Deliberately 404 (not 403) so a caller can't distinguish "exists but not
// yours" from "doesn't exist" and enumerate ids.
export function notFound(message = "Not found.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

// Confirms the authed user may access the inspection and returns the row with
// the requested columns, or null. Company owners match any inspection on their
// team; everyone else matches their own inspector_id.
export async function authorizeInspection(
  admin: any,
  userId: string,
  inspectionId: string | number | null | undefined,
  columns = "id, inspector_id, company_id"
) {
  const id = String(inspectionId || "").trim();
  if (!id) return null;

  const filter = await resolveInspectionAccessFilter(admin, userId);

  const { data } = await admin
    .from("inspections")
    .select(columns)
    .eq("id", id)
    .eq(filter.column, filter.value)
    .maybeSingle();

  return data || null;
}

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionByToken } from "../../../../lib/secure24";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight read-only check the client portal card uses to decide whether to
// show itself. Given a report's share token it returns whether the OWNING
// inspector enabled the referral and whether it was already requested. On any
// miss it returns { enabled: false } -- it never reveals anything, so it's safe
// to call from an unauthenticated portal.

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(request: Request) {
  const off = NextResponse.json({ enabled: false, alreadyRequested: false });

  const lookup = new URL(request.url).searchParams.get("lookup") || "";
  if (!lookup.trim()) return off;

  const db = admin();
  const inspection = await resolveInspectionByToken(db, lookup);
  if (!inspection?.id || !inspection.inspector_id) return off;

  const { data: setting } = await db
    .from("secure24_settings")
    .select("enabled")
    .eq("user_id", inspection.inspector_id)
    .maybeSingle();

  if (setting?.enabled !== true) return off;

  const { data: prior } = await db
    .from("secure24_leads")
    .select("id")
    .eq("inspection_id", inspection.id)
    .eq("status", "submitted")
    .maybeSingle();

  return NextResponse.json({
    enabled: true,
    alreadyRequested: Boolean(prior?.id),
  });
}

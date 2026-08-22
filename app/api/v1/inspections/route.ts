import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { authenticateApiKey } from "../../../../lib/apiKeys";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public API: list the API key owner's inspections. Auth via
// `Authorization: Bearer <flow_...>`. Only a safe field subset is exposed.
const FIELDS = [
  "id",
  "property_address",
  "city",
  "state",
  "zip",
  "client_name",
  "client_email",
  "realtor_name",
  "inspection_date",
  "inspection_status",
  "report_status",
  "payment_status",
  "published",
  "created_at",
] as const;

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(request: Request) {
  const db = admin();
  const auth = await authenticateApiKey(request, db);
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key. Send Authorization: Bearer <key>." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  // Scope to the key owner (an inspector sees their own; a company owner their team).
  const filter = await resolveInspectionAccessFilter(db, auth.userId);

  const { data, error } = await db
    .from("inspections")
    .select(FIELDS.join(","))
    .eq(filter.column, filter.value)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    object: "list",
    limit,
    offset,
    count: (data || []).length,
    data: data || [],
  });
}

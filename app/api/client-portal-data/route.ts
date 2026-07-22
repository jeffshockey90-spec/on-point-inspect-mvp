import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Only the fields the client portal page actually renders. Deliberately
// excludes client/realtor contact info, Stripe identifiers, and other
// internal fields that don't belong in a response reachable by anyone who
// has (or guesses) a portal link. Picked in JS after a `select("*")` rather
// than passed as a SQL column list, since several of these are legacy
// fallback names the page checks defensively and don't exist as real
// columns on every schema version - a SQL column list 500s on an unknown
// column, a JS pick just skips it.
const INSPECTION_FIELDS = [
  "id",
  "property_image",
  "street_view_url",
  "cover_photo_url",
  "google_photo_url",
  "property_photo_url",
  "place_photo_url",
  "photo_url",
  "image_url",
  "invoice_amount",
  "total_price",
  "total",
  "price",
  "inspection_price",
  "inspection_fee",
  "amount_paid",
  "balance_due",
  "payment_status",
  "invoice_status",
  "agreement_status",
  "agreement_state",
  "agreement_signed_status",
  "agreement_signed",
  "signed_agreement",
  "report_status",
  "status",
  "delivery_status",
  "report_delivery_status",
  "published",
  "is_published",
  "report_published",
  "service_mode",
  "inspection_type",
  "services",
  "mold",
  "radon",
  "property_address",
  "address",
  "executive_summary",
  "client_name",
  "inspection_date",
  "inspection_time",
  "year_built",
  "square_feet",
  "sqft",
  "public_share_token",
  "share_token",
  "report_share_token",
];

function pickInspectionFields(row: Record<string, any>) {
  const picked: Record<string, any> = {};
  for (const field of INSPECTION_FIELDS) {
    if (field in row) picked[field] = row[field];
  }
  return picked;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lookup = (searchParams.get("lookup") || "").trim();

    if (!lookup) {
      return NextResponse.json({ error: "Missing lookup." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    let { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("public_share_token", lookup)
      .maybeSingle();

    // Legacy fallback for portal links sent out before share tokens existed.
    if (!inspection && /^\d+$/.test(lookup)) {
      const fallback = await supabase
        .from("inspections")
        .select("*")
        .eq("id", lookup)
        .maybeSingle();

      inspection = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("Client portal inspection lookup error:", error);
      return NextResponse.json(
        { error: "Failed to load inspection." },
        { status: 500 }
      );
    }

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const inspectionId = String((inspection as any).id);

    const [checklistResult, moldResult, radonResult] = await Promise.all([
      supabase
        .from("section_checklist_selections")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("mold_tests")
        .select("*")
        .eq("inspection_id", inspectionId)
        .maybeSingle(),
      supabase
        .from("radon_tests")
        .select("*")
        .eq("inspection_id", inspectionId)
        .maybeSingle(),
    ]);

    if (checklistResult.error) {
      console.error("Client portal checklist load error:", checklistResult.error);
    }

    if (moldResult.error) {
      console.error("Client portal mold link error:", moldResult.error);
    }

    if (radonResult.error) {
      console.error("Client portal radon link error:", radonResult.error);
    }

    return NextResponse.json({
      inspection: pickInspectionFields(inspection),
      checklistRows: checklistResult.data || [],
      moldTest: moldResult.data || null,
      radonTest: radonResult.data || null,
    });
  } catch (error: any) {
    console.error("Client portal data API error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to load client portal data." },
      { status: 500 }
    );
  }
}

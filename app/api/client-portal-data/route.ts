import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getCompanyBrandingById } from "../../../lib/companyBranding";
import { getReportDeliveryState } from "../../../lib/reportDelivery";
import { reportSecurityEvent } from "../../../lib/securityAlerts";

// Resolves whether the currently signed-in user (if any) is allowed to open a
// portal by raw inspection id: the owning inspector, a member of the owning
// company, or a client contact whose email matches. Used only as a fallback so
// legacy raw-id portal links keep working for authenticated users WITHOUT
// re-opening anonymous id enumeration.
async function authedUserOwnsInspection(admin: any, inspection: any) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) return false;

    if (String(inspection.inspector_id || "") === user.id) return true;

    if (inspection.company_id) {
      const { data: membership } = await admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("company_id", inspection.company_id)
        .maybeSingle();
      if (membership) return true;
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
      if (contact) return true;
    }
  } catch {
    // fall through to no-access
  }

  return false;
}

const SHARE_TOKEN_FIELDS = [
  "public_share_token",
  "share_token",
  "report_share_token",
];

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
  "agreement_waived",
  "agreement_waived_at",
  "agreement_waived_by_name",
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
  "client_organization_name",
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

    // Primary: resolve by the unguessable share token (anonymous clients open
    // the portal this way from their emailed link).
    let { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("public_share_token", lookup)
      .maybeSingle();

    // Legacy raw-id fallback, but ONLY for a signed-in user who actually owns or
    // participates in the inspection. This keeps old raw-id portal links and the
    // logged-in-client redirect working, without letting an anonymous caller
    // enumerate sequential ids to read client name/address/summary/financials.
    if (!inspection && !error && /^\d+$/.test(lookup)) {
      const { data: candidate } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", lookup)
        .maybeSingle();

      if (candidate && (await authedUserOwnsInspection(supabase, candidate))) {
        inspection = candidate;
      }
    }

    if (error) {
      console.error("Client portal inspection lookup error:", error);
      return NextResponse.json(
        { error: "Failed to load inspection." },
        { status: 500 }
      );
    }

    if (!inspection) {
      // A failed NUMERIC lookup means someone tried a guessed sequential id
      // rather than a real share token — log it as a possible enumeration probe.
      if (/^\d+$/.test(lookup)) {
        await reportSecurityEvent({ req, type: "portal_enum", detail: { lookup } });
      }
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

    const branding = await getCompanyBrandingById((inspection as any).company_id);

    // Enforce the delivery gate here, not just in the portal UI: the portal can
    // show its "locked" state from the payment/agreement fields, but it must not
    // receive the share token (which opens the full report at /share) until the
    // report is actually deliverable (audit finding C3).
    const delivery = await getReportDeliveryState(supabase, inspection as any);

    const pickedInspection = pickInspectionFields(inspection);

    if (!delivery.deliverable) {
      for (const field of SHARE_TOKEN_FIELDS) {
        delete pickedInspection[field];
      }
    }

    // Attach the company's online-payment-fee config so the portal quotes the
    // exact fee checkout will charge (both use lib/onlinePaymentFee), instead of
    // a hardcoded 3.95% that drifts when the company changes its fee settings.
    if ((inspection as any).company_id) {
      const { data: companyFee } = await supabase
        .from("companies")
        .select(
          "online_payment_fee_enabled, online_payment_fee_type, online_payment_fee_amount",
        )
        .eq("id", (inspection as any).company_id)
        .maybeSingle();

      if (companyFee) {
        pickedInspection.online_payment_fee_enabled = companyFee.online_payment_fee_enabled;
        pickedInspection.online_payment_fee_type = companyFee.online_payment_fee_type;
        pickedInspection.online_payment_fee_amount = companyFee.online_payment_fee_amount;
      }
    }

    return NextResponse.json({
      inspection: pickedInspection,
      deliverable: delivery.deliverable,
      companyBranding: branding,
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

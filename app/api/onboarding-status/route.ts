import { NextResponse } from "next/server";
import {
  getAdminClient,
  getSessionUser,
  unauthorized,
} from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Setup-progress signals for the dashboard onboarding checklist. All reads are
// scoped to the signed-in user / their company.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const admin = getAdminClient();

  const { data: membership } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();

  let company: any = null;
  if (membership?.company_id) {
    // select("*") so a schema without one of these columns doesn't 500.
    const { data } = await admin
      .from("companies")
      .select("*")
      .eq("id", membership.company_id)
      .maybeSingle();
    company = data || null;
  }

  const [{ count: inspectionCount }, { count: publishedCount }] =
    await Promise.all([
      admin
        .from("inspections")
        .select("id", { count: "exact", head: true })
        .eq("inspector_id", user.id),
      admin
        .from("inspections")
        .select("id", { count: "exact", head: true })
        .eq("inspector_id", user.id)
        .eq("published", true),
    ]);

  const steps = [
    {
      key: "inspection",
      label: "Create your first inspection",
      done: (inspectionCount || 0) > 0,
      href: "/inspections/new",
    },
    {
      key: "publish",
      label: "Publish a report",
      done: (publishedCount || 0) > 0,
      href: "/reports",
    },
    {
      key: "logo",
      label: "Add your company logo",
      done: Boolean(company?.logo_url),
      href: "/settings",
    },
    {
      key: "stripe",
      label: "Connect Stripe payments",
      done: Boolean(company?.stripe_account_id),
      href: "/settings",
    },
    {
      key: "w9",
      label: "Add your W-9",
      done: Boolean(company?.w9_document_url),
      href: "/settings",
    },
    {
      key: "booking",
      label: "Turn on online booking",
      done: company?.public_profile_enabled === true,
      href: "/settings/public-profile",
    },
  ];

  return NextResponse.json({
    steps,
    completeCount: steps.filter((step) => step.done).length,
    total: steps.length,
  });
}

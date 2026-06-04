import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "../../../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY.");

  return new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
  });
}

async function getCompanyForUser(supabase: any, userId: string) {
  const { data: companyUser } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!companyUser?.company_id) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyUser.company_id)
    .maybeSingle();

  return company;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://on-point-inspect-mvp.vercel.app"
  );
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const stripe = getStripe();
    const company = await getCompanyForUser(supabase, user.id);

    if (!company?.stripe_account_id) {
      return NextResponse.redirect(`${getAppUrl()}/settings?stripe=not_connected`);
    }

    const account = await stripe.accounts.retrieve(company.stripe_account_id);

    await supabase
      .from("companies")
      .update({
        stripe_onboarding_complete:
          Boolean(account.details_submitted) && Boolean(account.charges_enabled),
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        stripe_details_submitted: Boolean(account.details_submitted),
      })
      .eq("id", company.id);

    return NextResponse.redirect(`${getAppUrl()}/settings?stripe=refreshed`);
  } catch (error: any) {
    console.error("Stripe Connect refresh error:", error);
    return NextResponse.redirect(
      `${getAppUrl()}/settings?stripe_error=${encodeURIComponent(
        error?.message || "Stripe refresh failed"
      )}`
    );
  }
}

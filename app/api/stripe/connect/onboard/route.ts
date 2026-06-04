import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "../../../../utils/supabase/server";

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

    if (!company) {
      return NextResponse.redirect(`${getAppUrl()}/settings?error=no_company`);
    }

    let stripeAccountId = company.stripe_account_id || "";

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: company.email || user.email || undefined,
        business_profile: {
          name: company.display_name || company.name || undefined,
          url: company.website || undefined,
        },
        metadata: {
          company_id: String(company.id),
          user_id: String(user.id),
          platform: "on_point_inspect",
        },
      });

      stripeAccountId = account.id;

      await supabase
        .from("companies")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_account_type: "express",
          stripe_onboarding_complete: false,
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          stripe_details_submitted: false,
        })
        .eq("id", company.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${getAppUrl()}/api/stripe/connect/onboard`,
      return_url: `${getAppUrl()}/api/stripe/connect/refresh`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (error: any) {
    console.error("Stripe Connect onboarding error:", error);
    return NextResponse.redirect(
      `${getAppUrl()}/settings?stripe_error=${encodeURIComponent(
        error?.message || "Stripe onboarding failed"
      )}`
    );
  }
}

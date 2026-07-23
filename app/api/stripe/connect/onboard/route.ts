import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "../../../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(key, {
  });
}

async function getCompanyForUser(supabase: any, userId: string) {
  const { data: companyUser, error: companyUserError } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (companyUserError) {
    console.error("Company user lookup failed:", companyUserError);
    throw companyUserError;
  }

  if (!companyUser?.company_id) return null;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyUser.company_id)
    .maybeSingle();

  if (companyError) {
    console.error("Company lookup failed:", companyError);
    throw companyError;
  }

  return company;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://app.flowinspect.app"
  );
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Stripe Connect user lookup failed:", userError);
    }

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

      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error("COMPANY UPDATE FAILED:", updateError);
        throw updateError;
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${getAppUrl()}/api/stripe/connect/refresh`,
      return_url: `${getAppUrl()}/api/stripe/connect/return`,
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

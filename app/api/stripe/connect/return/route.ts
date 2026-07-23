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
      console.error("Stripe Connect return user lookup failed:", userError);
    }

    if (!user) {
      return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const stripe = getStripe();
    const company = await getCompanyForUser(supabase, user.id);

    if (!company) {
      return NextResponse.redirect(`${getAppUrl()}/settings?error=no_company`);
    }

    if (!company.stripe_account_id) {
      return NextResponse.redirect(`${getAppUrl()}/settings?stripe=not_connected`);
    }

    const account = await stripe.accounts.retrieve(company.stripe_account_id);

    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const detailsSubmitted = Boolean(account.details_submitted);
    const onboardingComplete = detailsSubmitted && chargesEnabled;

    const { error: updateError } = await supabase
      .from("companies")
      .update({
        stripe_onboarding_complete: onboardingComplete,
        stripe_charges_enabled: chargesEnabled,
        stripe_payouts_enabled: payoutsEnabled,
        stripe_details_submitted: detailsSubmitted,
      })
      .eq("id", company.id);

    if (updateError) {
      console.error("Stripe Connect company status update failed:", updateError);
      throw updateError;
    }

    const status = onboardingComplete
      ? "connect_complete"
      : "connect_incomplete";

    return NextResponse.redirect(`${getAppUrl()}/settings?stripe=${status}`);
  } catch (error: any) {
    console.error("Stripe Connect return error:", error);

    return NextResponse.redirect(
      `${getAppUrl()}/settings?stripe_error=${encodeURIComponent(
        error?.message || "Stripe return failed"
      )}`
    );
  }
}

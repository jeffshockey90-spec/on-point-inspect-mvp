import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const { userId, email, fullName, businessName } = await req.json();

    if (!userId || !email || !businessName) {
      return NextResponse.json(
        { error: "Missing user, email, or business name." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existingLink } = await supabase
      .from("company_users")
      .select("id, company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingLink?.company_id) {
      return NextResponse.json({
        ok: true,
        companyId: existingLink.company_id,
        existing: true,
      });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: businessName,
        display_name: businessName,
        email,
        phone: null,
        website: null,
        logo_url: null,
        license_info: null,
        brand_color: "#14b8a6",
        report_footer_branding: null,
        show_powered_by: true,
        online_payment_fee_enabled: true,
        online_payment_fee_type: "flat",
        online_payment_fee_amount: 15,
        stripe_account_type: "express",
        stripe_onboarding_complete: false,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
      })
      .select("*")
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message || "Failed to create company." },
        { status: 500 }
      );
    }

    const { error: linkError } = await supabase.from("company_users").insert({
      company_id: company.id,
      user_id: userId,
      role: "owner",
    });

    if (linkError) {
      return NextResponse.json(
        { error: linkError.message || "Failed to link company user." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      companyId: company.id,
      businessName,
      fullName,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Company setup failed." },
      { status: 500 }
    );
  }
}

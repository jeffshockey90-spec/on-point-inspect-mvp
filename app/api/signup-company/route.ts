import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { userId, email, fullName, businessName } = await req.json();

    if (!userId || !email || !fullName || !businessName) {
      return NextResponse.json(
        { error: "Missing required signup company fields." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date().toISOString();

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email,
        full_name: fullName,
        role: "inspector",
        updated_at: now,
      });

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { data: existingCompanyUser } = await supabaseAdmin
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingCompanyUser?.company_id) {
      return NextResponse.json({
        success: true,
        company_id: existingCompanyUser.company_id,
        message: "Company already exists for this user.",
      });
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: businessName,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (companyError) {
      return NextResponse.json(
        { error: companyError.message },
        { status: 500 }
      );
    }

    const { error: companyUserError } = await supabaseAdmin
      .from("company_users")
      .insert({
        company_id: company.id,
        user_id: userId,
        role: "owner",
        created_at: now,
      });

    if (companyUserError) {
      return NextResponse.json(
        { error: companyUserError.message },
        { status: 500 }
      );
    }

    const { error: profileCompanyError } = await supabaseAdmin
      .from("profiles")
      .update({
        company_id: company.id,
        updated_at: now,
      })
      .eq("id", userId);

    if (profileCompanyError) {
      return NextResponse.json(
        { error: profileCompanyError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      company_id: company.id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Company setup failed." },
      { status: 500 }
    );
  }
}
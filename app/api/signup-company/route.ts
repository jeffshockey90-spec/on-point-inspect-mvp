import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushNotification } from "../../../lib/push";
import { OWNER_EMAILS } from "../../../lib/ownerEmails";

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
      });

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { data: existingCompanyUser, error: existingError } =
      await supabaseAdmin
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

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
        email,
        created_at: now,
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

    for (const ownerEmail of OWNER_EMAILS) {
      sendPushNotification({
        title: "🎉 New Account Created",
        body: `${fullName} (${email}) just signed up as "${businessName}".`,
        url: "/dashboard/owner",
        eventType: "new_account",
        target: "user",
        targetUserEmail: ownerEmail,
      }).catch((error) => {
        console.error("New account owner push failed:", error);
      });
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
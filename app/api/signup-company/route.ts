import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { sendPushNotification } from "../../../lib/push";
import { OWNER_EMAILS } from "../../../lib/ownerEmails";

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_ROLES = ["inspector", "client", "realtor"];

// Finalizes a new signup with the service-role client so it works even before
// the user's email is confirmed (no session yet, so a client-side write would
// be blocked by RLS). Creates the profile for every role, and a company +
// owner membership for inspectors.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, email, fullName, businessName } = body;
    const role = ALLOWED_ROLES.includes(body?.role) ? body.role : "inspector";

    if (!userId || !email || !fullName) {
      return NextResponse.json(
        { error: "Missing required signup fields." },
        { status: 400 }
      );
    }

    if (role === "inspector" && !String(businessName || "").trim()) {
      return NextResponse.json(
        { error: "Please enter your business name." },
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
        role,
        updated_at: now,
      });

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message || "Could not create your profile." },
        { status: 500 }
      );
    }

    // Only inspectors get a company + owner membership.
    if (role !== "inspector") {
      return NextResponse.json({ success: true });
    }

    const { data: existingCompanyUser, error: existingError } =
      await supabaseAdmin
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message || "Could not check existing company." },
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
        name: String(businessName).trim(),
        email,
        created_at: now,
      })
      .select("id")
      .single();

    if (companyError) {
      return NextResponse.json(
        { error: companyError.message || "Could not create your company." },
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
        { error: companyUserError.message || "Could not link you to your company." },
        { status: 500 }
      );
    }

    // Notify the owner(s) of the new account over BOTH push and email, and
    // AWAIT them. In a serverless runtime, fire-and-forget promises can be
    // frozen the moment the response returns - which is why the previous
    // push often never actually sent. Email is the reliable channel (push
    // tokens go stale); failures are logged but never block signup.
    const businessLabel = String(businessName).trim();

    const notifyResults = await Promise.allSettled([
      ...OWNER_EMAILS.map((ownerEmail) =>
        sendPushNotification({
          title: "🎉 New Account Created",
          body: `${fullName} (${email}) just signed up as "${businessLabel}".`,
          url: "/dashboard/owner",
          eventType: "new_account",
          target: "user",
          targetUserEmail: ownerEmail,
        })
      ),
      resend.emails.send({
        from: "FLOW <alerts@onpointhomeinspect.com>",
        to: OWNER_EMAILS,
        subject: `New FLOW signup: ${fullName} (${businessLabel})`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="margin:0 0 8px;">🎉 New inspector signed up</h2>
            <p style="margin:0 0 4px;"><strong>${fullName}</strong></p>
            <p style="margin:0 0 4px;color:#334155;">${email}</p>
            <p style="margin:0 0 16px;color:#334155;">Business: <strong>${businessLabel}</strong></p>
            <p style="margin:16px 0;">
              <a href="https://app.flowinspect.app/dashboard/owner/users" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
                View in Owner Dashboard
              </a>
            </p>
            <p style="font-size:12px;color:#64748b;">FLOW</p>
          </div>
        `,
        text: `New inspector signed up on FLOW\n\n${fullName}\n${email}\nBusiness: ${businessLabel}\n\nhttps://app.flowinspect.app/dashboard/owner/users`,
      }),
    ]);

    notifyResults.forEach((result) => {
      if (result.status === "rejected") {
        console.error("New account owner alert failed:", result.reason);
      }
    });

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

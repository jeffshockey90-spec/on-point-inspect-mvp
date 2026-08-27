import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { sendPushNotification } from "../../../lib/push";
import { OWNER_EMAILS } from "../../../lib/ownerEmails";
import { createClient as createServerSupabase } from "../../../utils/supabase/server";
import { reportSecurityEvent } from "../../../lib/securityAlerts";
import { normalizeCountry, normalizeLanguage, currencyForCountry } from "../../../lib/locale";

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

    // Bind the finalize call to the real account. `userId` arrives in the body
    // because there may be no session yet on a confirm-email flow, so it can't
    // be trusted on its own — anyone could otherwise overwrite another user's
    // profile by posting their uid.
    //
    //  - If the request DOES carry a session (the normal, confirmation-off
    //    case), its uid must match the body uid.
    //  - Either way, the uid must be a real auth user whose email matches the
    //    submitted email, so a caller can't finalize signup for an id/email
    //    pair they don't actually control.
    try {
      const authClient = await createServerSupabase();
      const {
        data: { user: sessionUser },
      } = await authClient.auth.getUser();

      if (sessionUser && sessionUser.id !== userId) {
        await reportSecurityEvent({
          req,
          type: "signup_hijack",
          detail: { claimedUserId: userId, sessionUserId: sessionUser.id },
        });
        return NextResponse.json(
          { error: "Signup session does not match this account." },
          { status: 403 }
        );
      }
    } catch {
      // No/!invalid session cookie — fall through to the auth-record check.
    }

    const { data: authRecord, error: authLookupError } =
      await supabaseAdmin.auth.admin.getUserById(String(userId));

    if (
      authLookupError ||
      !authRecord?.user ||
      String(authRecord.user.email || "").trim().toLowerCase() !==
        String(email || "").trim().toLowerCase()
    ) {
      await reportSecurityEvent({
        req,
        type: "signup_hijack",
        detail: { claimedUserId: userId, submittedEmail: email },
      });
      return NextResponse.json(
        { error: "Could not verify this account." },
        { status: 403 }
      );
    }

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

    const country = normalizeCountry(body?.country);
    const preferredLanguage = normalizeLanguage(body?.language);
    const currency = currencyForCountry(country);

    // Include locale, but retry without it if the migration (company-locale.sql)
    // hasn't been applied yet — a new inspector must always be able to sign up.
    const baseCompany = { name: String(businessName).trim(), email, created_at: now };
    let { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        ...baseCompany,
        country,
        preferred_language: preferredLanguage,
        currency,
      })
      .select("id")
      .single();

    if (companyError) {
      ({ data: company, error: companyError } = await supabaseAdmin
        .from("companies")
        .insert(baseCompany)
        .select("id")
        .single());
    }

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message || "Could not create your company." },
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
        from: "FLOW <notifications@flowinspect.app>",
        to: OWNER_EMAILS,
        subject: `New FLOW signup: ${fullName} (${businessLabel})`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="margin:0 0 8px;">🎉 New inspector signed up</h2>
            <p style="margin:0 0 4px;"><strong>${fullName}</strong></p>
            <p style="margin:0 0 4px;color:#334155;">${email}</p>
            <p style="margin:0 0 16px;color:#334155;">Business: <strong>${businessLabel}</strong></p>
            <p style="margin:16px 0;">
              <a href="https://app.flowinspect.app/dashboard/owner/users" style="display:inline-block;background:#14b8a6;color:var(--fl-ground);font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
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

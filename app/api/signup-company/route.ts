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

// Notify the owner(s) of a new signup over BOTH push and email, for ANY role
// (inspector, realtor, client). Awaited so the serverless runtime doesn't
// freeze the sends when the response returns; failures are logged, never fatal.
async function notifyOwnersOfSignup(opts: {
  fullName: string;
  email: string;
  role: string;
  businessLabel?: string;
}) {
  const fullName = String(opts.fullName || "").trim() || "Someone";
  const email = String(opts.email || "").trim();
  const role = String(opts.role || "").trim().toLowerCase();
  const businessLabel = String(opts.businessLabel || "").trim();
  const roleWord = role === "inspector" ? "inspector" : role === "realtor" ? "realtor" : role || "user";
  const asPart =
    role === "inspector" && businessLabel ? `as "${businessLabel}"` : `as a ${roleWord}`;
  const bodyText = `${fullName} (${email}) just signed up ${asPart}.`;
  const subject =
    role === "inspector"
      ? `New FLOW signup: ${fullName}${businessLabel ? ` (${businessLabel})` : ""}`
      : `New FLOW ${roleWord} signup: ${fullName}`;
  const businessLine =
    role === "inspector" && businessLabel
      ? `<p style="margin:0 0 4px;color:#334155;">Business: <strong>${businessLabel}</strong></p>`
      : "";

  // Push to each owner (each may have devices). Capture per-owner results.
  const pushResults = await Promise.allSettled(
    OWNER_EMAILS.map((ownerEmail) =>
      sendPushNotification({
        title: "🎉 New Account Created",
        body: bodyText,
        url: "/dashboard/owner/users",
        eventType: "new_account",
        target: "user",
        targetUserEmail: ownerEmail,
      }),
    ),
  );
  const pushSummary = pushResults.map((r, i) => ({
    owner: OWNER_EMAILS[i],
    ok: r.status === "fulfilled",
    ...(r.status === "fulfilled" ? { result: r.value } : { error: String(r.reason) }),
  }));

  // Email the owners. Capture id/error.
  let emailStatus: "sent" | "error" = "sent";
  let emailId: string | null = null;
  let emailError: string | null = null;
  try {
    const em = await resend.emails.send({
      from: "FLOW <notifications@flowinspect.app>",
      to: OWNER_EMAILS,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="margin:0 0 8px;">🎉 New ${roleWord} signed up</h2>
          <p style="margin:0 0 4px;"><strong>${fullName}</strong></p>
          <p style="margin:0 0 4px;color:#334155;">${email}</p>
          ${businessLine}
          <p style="margin:16px 0;">
            <a href="https://app.flowinspect.app/dashboard/owner/users" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
              View in Owner Dashboard
            </a>
          </p>
          <p style="font-size:12px;color:#64748b;">FLOW</p>
        </div>
      `,
      text: `New ${roleWord} signed up on FLOW\n\n${fullName}\n${email}${
        businessLabel && role === "inspector" ? `\nBusiness: ${businessLabel}` : ""
      }\n\nhttps://app.flowinspect.app/dashboard/owner/users`,
    });
    if ((em as any)?.error) {
      emailStatus = "error";
      emailError = String((em as any).error.message || (em as any).error);
    } else {
      emailId = (em as any)?.data?.id || null;
    }
  } catch (e: any) {
    emailStatus = "error";
    emailError = e?.message || "send threw";
  }

  // Record EVERY owner alert in email_logs so it's never a blind spot again —
  // shows up in Sent Emails and lets us confirm whether the alert actually fired
  // (and whether push/email succeeded) after the fact.
  try {
    const logAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await logAdmin.from("email_logs").insert({
      inspection_id_bigint: null,
      recipient: OWNER_EMAILS.join(", "),
      recipient_email: OWNER_EMAILS[0] || null,
      email_type: "owner_signup_alert",
      subject,
      message: `${bodyText} Email ${emailStatus}${emailError ? ` (${emailError})` : ""}.`,
      status: emailStatus,
      resend_id: emailId,
      sent_at: emailStatus === "sent" ? new Date().toISOString() : null,
      metadata: {
        type: "owner_signup_alert",
        signup: { fullName, email, role, businessLabel },
        push: pushSummary,
        emailError,
      },
    });
  } catch (e) {
    console.error("owner alert log insert failed:", e);
  }
}

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

    // Only inspectors get a company + owner membership. Non-inspector signups
    // (realtor / client) still alert the owner here before returning.
    if (role !== "inspector") {
      await notifyOwnersOfSignup({ fullName, email, role });
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

    // Notify the owner(s) of the new inspector + company (push + email).
    await notifyOwnersOfSignup({
      fullName,
      email,
      role: "inspector",
      businessLabel: String(businessName).trim(),
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

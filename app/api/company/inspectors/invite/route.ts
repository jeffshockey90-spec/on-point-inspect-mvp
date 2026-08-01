import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { sendPushNotification } from "../../../../../lib/push";
import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";

const resend = new Resend(process.env.RESEND_API_KEY);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();

    if (!name || !email || !email.includes("@")) {
      return NextResponse.json({ error: "A name and valid email are required." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: callerMembership } = await admin
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!callerMembership?.company_id || callerMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the company owner can invite inspectors." },
        { status: 403 }
      );
    }

    const companyId = callerMembership.company_id;

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: existingMembership } = await admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", existingProfile.id)
        .maybeSingle();

      if (existingMembership?.company_id) {
        return NextResponse.json(
          { error: "That email already belongs to an account on a company." },
          { status: 400 }
        );
      }
    }

    const { data: linkData, error: inviteError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { full_name: name, role: "inspector" },
        redirectTo: `${getAppUrl()}/reset-password`,
      },
    });

    if (inviteError || !linkData?.user) {
      return NextResponse.json(
        { error: inviteError?.message || "Could not create invite." },
        { status: 500 }
      );
    }

    const newUserId = linkData.user.id;
    const actionLink = linkData.properties?.action_link;

    // The auto-provisioning trigger on auth.users creates a standalone
    // profiles/companies/company_users(role=owner) row for every new
    // signup - undo that and attach this person to the inviting company
    // as an inspector instead.
    await admin.from("company_users").delete().eq("user_id", newUserId);

    const { data: strayCompanies } = await admin
      .from("companies")
      .select("id")
      .eq("email", email);

    for (const stray of strayCompanies || []) {
      if (stray.id !== companyId) {
        await admin.from("companies").delete().eq("id", stray.id);
      }
    }

    await admin.from("profiles").upsert({
      id: newUserId,
      email,
      full_name: name,
      role: "inspector",
      updated_at: new Date().toISOString(),
    });

    const { error: membershipError } = await admin.from("company_users").insert({
      company_id: companyId,
      user_id: newUserId,
      role: "inspector",
      created_at: new Date().toISOString(),
    });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (actionLink && process.env.RESEND_API_KEY) {
      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle();

      const companyName = company?.name || "your team";

      try {
        await resend.emails.send({
          from: "FLOW <alerts@onpointhomeinspect.com>",
          to: email,
          subject: `You've been added to ${companyName} on FLOW`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
              <p>Hi ${name},</p>
              <p>${companyName} added you as an inspector on FLOW. Set your password to get started:</p>
              <p style="margin:24px 0;">
                <a href="${actionLink}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
                  Set Your Password
                </a>
              </p>
              <p style="font-size:12px;color:#64748b;">FLOW</p>
            </div>
          `,
          text: `Hi ${name},\n\n${companyName} added you as an inspector on FLOW. Set your password to get started:\n${actionLink}\n\nFLOW`,
        });
      } catch (emailError) {
        console.error("Inspector invite email failed:", emailError);
      }
    }

    // Await so the push actually sends - a fire-and-forget promise can be
    // frozen when the serverless function returns.
    await Promise.allSettled(
      OWNER_EMAILS.map((ownerEmail) =>
        sendPushNotification({
          title: "🎉 New Account Created",
          body: `${name} (${email}) was invited as an inspector.`,
          url: "/dashboard/owner",
          eventType: "new_account",
          target: "user",
          targetUserEmail: ownerEmail,
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Inspector invite error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not send invite." },
      { status: 500 }
    );
  }
}

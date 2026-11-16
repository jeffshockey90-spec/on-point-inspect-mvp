// Re-send the "set your password" email to a team member who hasn't signed in
// yet. Owner-only, same company only. Uses a recovery link (works for an
// already-created invited user) that lands on the same /reset-password page.

import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildInspectorInviteEmail, inviteStatusFor } from "../../../../../lib/inspectorInvite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
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
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json().catch(() => ({}) as any);
    const userId = String(body?.userId || "");
    if (!userId) return NextResponse.json({ error: "Missing team member." }, { status: 400 });

    const admin = createAdminClient();

    const { data: callerMembership } = await admin
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!callerMembership?.company_id || callerMembership.role !== "owner") {
      return NextResponse.json({ error: "Only the company owner can resend invites." }, { status: 403 });
    }

    const { data: membership } = await admin
      .from("company_users")
      .select("user_id")
      .eq("company_id", callerMembership.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

    const { data: authData } = await admin.auth.admin.getUserById(userId);
    const authUser = authData?.user;
    if (!authUser?.email) return NextResponse.json({ error: "Team member has no email." }, { status: 400 });
    if (inviteStatusFor(authUser) === "active") {
      return NextResponse.json({ error: "They've already signed in — no invite needed." }, { status: 400 });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authUser.email,
      options: { redirectTo: `${getAppUrl()}/reset-password` },
    });
    const actionLink = linkData?.properties?.action_link;
    if (linkError || !actionLink) {
      return NextResponse.json({ error: linkError?.message || "Could not create invite link." }, { status: 500 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
    }

    const [{ data: company }, { data: profile }] = await Promise.all([
      admin.from("companies").select("name").eq("id", callerMembership.company_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);

    const inviteEmail = buildInspectorInviteEmail({
      name: profile?.full_name || "",
      companyName: company?.name || "your team",
      actionLink,
      reminder: true,
    });

    const { error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "FLOW <notifications@flowinspect.app>",
      to: authUser.email,
      subject: inviteEmail.subject,
      html: inviteEmail.html,
      text: inviteEmail.text,
    });
    if (sendError) return NextResponse.json({ error: sendError.message }, { status: 500 });

    return NextResponse.json({ ok: true, email: authUser.email });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not resend invite." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { sendViaSmtp, getInspectorSmtpConfig } from "../../../../lib/companyEmailSmtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: Request) {
  // Session client: RLS confirms the caller owns this email_log.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const smtp = await getInspectorSmtpConfig(admin, user.id);
  if (!smtp) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Your company email isn't set up yet. Add your mail server settings under Settings → Company Email to enable this.",
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}) as any);
  const logId = body?.emailLogId ?? body?.id;
  if (!logId) return NextResponse.json({ error: "Missing emailLogId." }, { status: 400 });

  const { data: log } = await supabase
    .from("email_logs")
    .select("id, recipient_email, recipient, subject, html")
    .eq("id", logId)
    .maybeSingle();

  if (!log) return NextResponse.json({ error: "Email not found." }, { status: 404 });

  const to = String(log.recipient_email || log.recipient || "").trim();
  const html = String(log.html || "");
  const subject = String(log.subject || "A message from your inspector");
  if (!to || !html) {
    return NextResponse.json(
      { error: "This email has no saved recipient or content to resend." },
      { status: 400 },
    );
  }

  const result = await sendViaSmtp(smtp, { to, subject, html });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "send_failed", message: "Your company mail server rejected the send." },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const rejected = result.rejected.includes(to.toLowerCase());
  // The receiving server accepting the recipient is a real delivery signal.
  const delivered = !rejected && (result.accepted.includes(to.toLowerCase()) || result.accepted.length > 0);

  // Reflect the send on the log (service role, so RLS on writes doesn't block it)
  // -- the email's own tracking pixel / click links keep opens & clicks flowing.
  await admin
    .from("email_logs")
    .update({
      sent_at: now,
      status: rejected ? "failed" : "sent",
      bounced_at: rejected ? now : null,
      failed_at: null,
      delivered_at: delivered ? now : null,
      message: rejected ? "Company-email send rejected by recipient server" : "Sent via company email (SMTP)",
    })
    .eq("id", logId);

  if (rejected) {
    return NextResponse.json({
      ok: false,
      rejected: true,
      message: `Your mail server couldn't deliver to ${to} either — the address is likely invalid.`,
    });
  }

  return NextResponse.json({ ok: true, delivered, to });
}

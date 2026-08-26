import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { fetchRecentReplies, isInboundMailConfigured } from "../../../../lib/inboundMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const APP_URL = "https://app.flowinspect.app";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapHtml(message: string) {
  const body = escapeHtml(message).replace(/\n/g, "<br/>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#0f172a;max-width:600px;margin:auto;padding:28px 24px;background:#ffffff;">
    <a href="${APP_URL}" style="text-decoration:none;">
      <img src="${APP_URL}/icons/icon-192-v2.png" alt="FLOW" width="46" height="46" style="border-radius:12px;vertical-align:middle;border:0;" />
      <span style="font-weight:900;font-size:22px;color:#14b8a6;vertical-align:middle;margin-left:11px;">FLOW</span>
    </a>
    <div style="margin-top:20px;font-size:15px;color:#0f172a;">${body}</div>
  </div>`;
}

// Owner-only live diagnostic: connects to the mailbox right now and reports
// exactly what IMAP says (auth ok? IMAP enabled? how many messages?). Never
// returns the password. Open /api/owner/replies in a browser while logged in.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ownerEmail = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(ownerEmail)) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const configured = isInboundMailConfigured();
  const base = {
    configured,
    host: process.env.ZOHO_IMAP_HOST || "imap.zoho.com",
    port: Number(process.env.ZOHO_IMAP_PORT || 993),
    user: process.env.ZOHO_IMAP_USER || null,
    cronSecretSet: Boolean(process.env.CRON_SECRET),
  };

  if (!configured) {
    return NextResponse.json({ ...base, ok: false, error: "ZOHO_IMAP_USER / ZOHO_IMAP_PASSWORD not set in this environment." });
  }

  try {
    const msgs = await fetchRecentReplies(72);
    return NextResponse.json({
      ...base,
      ok: true,
      fetched: msgs.length,
      sample: msgs.slice(0, 5).map((m) => ({ from: m.fromEmail, subject: m.subject, receivedAt: m.receivedAt })),
    });
  } catch (e: any) {
    return NextResponse.json({ ...base, ok: false, error: e?.message || String(e) });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ownerEmail = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(ownerEmail)) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}) as any);
  const action = String(body.action || "").trim();
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  // Mark read / unread
  if (action === "read" || action === "unread") {
    const { error } = await admin
      .from("inbound_replies")
      .update({ is_read: action === "read" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Reply from FLOW (sends through Resend, threaded back to the original)
  if (action === "reply") {
    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    const { data: original } = await admin
      .from("inbound_replies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!original) return NextResponse.json({ error: "Reply not found." }, { status: 404 });
    if (!EMAIL_RE.test(String(original.from_email || ""))) {
      return NextResponse.json({ error: "That message has no valid reply address." }, { status: 400 });
    }

    const subjectBase = String(original.subject || "").replace(/^\s*(re:\s*)+/i, "").trim();
    const subject = `Re: ${subjectBase || "your message"}`;

    // Threading headers so the client's mail app keeps it in the same thread.
    const headers: Record<string, string> = {};
    if (original.message_id) {
      headers["In-Reply-To"] = original.message_id;
      headers["References"] = [original.refs, original.message_id].filter(Boolean).join(" ");
    }

    const { data, error } = await resend.emails.send({
      from: "FLOW Support <support@flowinspect.app>",
      to: String(original.from_email),
      replyTo: "FLOW Support <support@flowinspect.app>",
      subject,
      html: wrapHtml(message),
      text: message,
      headers,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin
      .from("inbound_replies")
      .update({ replied_at: new Date().toISOString(), is_read: true })
      .eq("id", id);

    return NextResponse.json({ ok: true, resendId: data?.id || null });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { listUnsubscribeHeaders } from "../../../../lib/emailUnsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapHtml(message: string) {
  const body = escapeHtml(message).replace(/\n/g, "<br/>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#0f172a;max-width:600px;margin:auto;padding:28px 24px;">
    <div style="font-weight:800;letter-spacing:0.24em;color:#14b8a6;text-transform:uppercase;font-size:12px;">FLOW</div>
    <div style="margin-top:18px;font-size:15px;color:#0f172a;">${body}</div>
    <a href="https://app.flowinspect.app" style="display:inline-block;margin-top:26px;background:#14b8a6;color:#ffffff;font-weight:800;text-decoration:none;padding:12px 26px;border-radius:10px;">Open FLOW</a>
    <p style="margin-top:28px;font-size:12px;color:#94a3b8;">You're receiving this because you have a FLOW inspector account.</p>
  </div>`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ownerEmail = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(ownerEmail)) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}) as any);
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim();
  const message = String(body.body || body.message || "").trim();

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
  }
  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: "FLOW <notifications@flowinspect.app>",
    to,
    replyTo: ownerEmail, // replies come straight back to the owner
    subject,
    html: wrapHtml(message),
    headers: listUnsubscribeHeaders(to),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

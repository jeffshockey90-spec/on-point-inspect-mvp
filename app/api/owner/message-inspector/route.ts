import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { listUnsubscribeHeaders } from "../../../../lib/emailUnsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const APP_URL = "https://app.flowinspect.app";
const IOS_APP_URL = "https://apps.apple.com/us/app/flow-inspection-software/id6777555077";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Resolve a friendly first name for the greeting. Prefers the real profile
// name; if that's missing or is actually an email, derives a name from the
// email's local part when it reads like one. Never returns a raw email — falls
// back to "there" rather than pasting an address into the message.
function firstName(name?: string, email?: string) {
  const raw = String(name || "").trim();
  if (raw && !raw.includes("@")) {
    const first = raw.split(/\s+/)[0];
    if (first) return capitalize(first);
  }
  const local = String(email || "").split("@")[0];
  const token = local.replace(/[0-9]+$/, "").split(/[._-]+/)[0];
  if (/^[a-zA-Z]{2,20}$/.test(token)) return capitalize(token);
  return "there";
}

function personalize(text: string, name?: string, email?: string) {
  return text.replace(/\{\{?\s*name\s*\}?\}/gi, firstName(name, email));
}

function wrapHtml(message: string) {
  const body = escapeHtml(message).replace(/\n/g, "<br/>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#0f172a;max-width:600px;margin:auto;padding:28px 24px;background:#ffffff;">
    <a href="${APP_URL}" style="text-decoration:none;">
      <img src="${APP_URL}/icons/icon-192-v2.png" alt="FLOW" width="52" height="52" style="border-radius:13px;vertical-align:middle;border:0;" />
      <span style="font-weight:900;font-size:24px;color:#14b8a6;vertical-align:middle;margin-left:12px;letter-spacing:0.01em;">FLOW</span>
    </a>
    <div style="margin-top:22px;font-size:15px;color:#0f172a;">${body}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${APP_URL}" style="display:inline-block;background:#14b8a6;color:#ffffff;font-weight:800;text-decoration:none;padding:12px 24px;border-radius:10px;">Open FLOW</a>
        </td>
        <td>
          <a href="${IOS_APP_URL}" style="display:inline-block;background:#0f172a;color:#ffffff;font-weight:800;text-decoration:none;padding:12px 24px;border-radius:10px;">Get the iOS App</a>
        </td>
      </tr>
    </table>
    <p style="margin-top:28px;font-size:12px;color:#94a3b8;">You're receiving this because you have a FLOW inspector account.</p>
  </div>`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const subject = String(body.subject || "").trim();
  const message = String(body.body || body.message || "").trim();
  const template = body.template ? String(body.template) : null;

  // Accept a batch (recipients:[{email,name}]) or a single ({to,name}).
  let recipients: { email: string; name?: string }[] = Array.isArray(body.recipients)
    ? body.recipients.map((r: any) => ({ email: String(r?.email || "").trim(), name: r?.name }))
    : body.to
      ? [{ email: String(body.to).trim(), name: body.name }]
      : [];
  recipients = recipients.filter((r) => EMAIL_RE.test(r.email));

  if (!recipients.length) {
    return NextResponse.json({ error: "No valid recipients." }, { status: 400 });
  }
  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    const personalSubject = personalize(subject, r.name, r.email);
    const html = wrapHtml(personalize(message, r.name, r.email));
    const { data, error } = await resend.emails.send({
      from: "FLOW <notifications@flowinspect.app>",
      to: r.email,
      // Replies go to a FLOW address (not the owner's personal email).
      replyTo: "FLOW Support <support@flowinspect.app>",
      subject: personalSubject,
      html,
      headers: listUnsubscribeHeaders(r.email),
    });

    if (error) {
      failed += 1;
      if (errors.length < 5) errors.push(error.message);
      continue;
    }
    sent += 1;

    try {
      await admin.from("owner_inspector_messages").insert({
        recipient_email: r.email.toLowerCase(),
        recipient_name: r.name || null,
        subject: personalSubject,
        template,
        resend_id: data?.id || null,
        status: "sent",
      });
    } catch {
      /* logging is best-effort */
    }
  }

  return NextResponse.json({ ok: sent > 0, sent, failed, errors });
}

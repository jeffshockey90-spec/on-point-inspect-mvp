import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { listUnsubscribeHeaders } from "../../../../lib/emailUnsubscribe";
import { buildAiToolsEmail, AI_TOOLS_SUBJECT } from "../../../../lib/emailTemplates/aiToolsEmail";
import { buildWhatsNewEmail } from "../../../../lib/emailTemplates/whatsNewEmail";
import { buildOwnerPlainEmail } from "../../../../lib/emailTemplates/ownerPlainEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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

  const isAiTools = template === "ai-tools";
  const isWhatsNew = template === "whats-new";

  // The What's New template is a designed card email built from the latest
  // changelog entries (fetched fresh at send time so it's always current),
  // rather than the plain-text preview body.
  let whatsNewEntries: { title: string; body: string }[] = [];
  if (isWhatsNew) {
    const { data: entries } = await admin
      .from("changelog_entries")
      .select("title, body")
      .order("published_at", { ascending: false })
      .limit(5);
    whatsNewEntries = (entries || []).map((e: any) => ({
      title: String(e.title || ""),
      body: String(e.body || ""),
    }));
  }

  for (const r of recipients) {
    const personalSubject = personalize(subject || (isAiTools ? AI_TOOLS_SUBJECT : ""), r.name, r.email);
    // The AI-tools announcement is a fully-designed HTML email (with hosted
    // screenshots). Every other template is the editable plain-text body.
    // Insert the log row FIRST so we have an id to key the open-tracking pixel
    // to (Resend's native open/click tracking is off for these — we use FLOW's
    // own pixel, exactly like the client/report emails do). Best-effort.
    let logId: string | number | null = null;
    try {
      const { data: logRow } = await admin
        .from("owner_inspector_messages")
        .insert({
          recipient_email: r.email.toLowerCase(),
          recipient_name: r.name || null,
          subject: personalSubject,
          template,
          status: "sent",
        })
        .select("id")
        .single();
      logId = logRow?.id ?? null;
    } catch {
      /* logging is best-effort */
    }

    const baseHtml = isAiTools
      ? buildAiToolsEmail(firstName(r.name, r.email))
      : isWhatsNew
        ? buildWhatsNewEmail(firstName(r.name, r.email), whatsNewEntries)
        : buildOwnerPlainEmail(personalize(message, r.name, r.email));

    // Route the email's links through the click tracker, then append a
    // transparent 1x1 open-tracking pixel — both keyed to this message row.
    const html = logId
      ? `${baseHtml.replace(
          /href="(https:\/\/[^"]+)"/g,
          (_m, u) =>
            `href="https://app.flowinspect.app/api/email-click?owner_message_id=${logId}&target=${encodeURIComponent(u)}"`,
        )}<img src="https://app.flowinspect.app/api/email-open?owner_message_id=${logId}" width="1" height="1" alt="" style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden" />`
      : baseHtml;

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
      if (logId) {
        try {
          await admin.from("owner_inspector_messages").update({ status: "failed" }).eq("id", logId);
        } catch {
          /* best-effort */
        }
      }
      continue;
    }
    sent += 1;

    if (logId && data?.id) {
      try {
        await admin.from("owner_inspector_messages").update({ resend_id: data.id }).eq("id", logId);
      } catch {
        /* best-effort */
      }
    }
  }

  return NextResponse.json({ ok: sent > 0, sent, failed, errors });
}

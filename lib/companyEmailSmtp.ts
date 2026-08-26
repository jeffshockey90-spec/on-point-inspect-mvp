import nodemailer from "nodemailer";

// Alternative send path: deliver an email through the inspector's own company
// mailbox (SMTP) instead of Resend. Used as a manual per-email fallback when a
// send doesn't get through. Configured entirely via env vars so no credentials
// live in the code:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
//   SMTP_FROM     (optional) the visible From address; defaults to SMTP_USER
//   SMTP_FROM_NAME(optional) the visible From display name
export function companyEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function companyEmailFrom() {
  const email = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const name = process.env.SMTP_FROM_NAME || "";
  return { email, header: name ? `${name} <${email}>` : email };
}

export type CompanySendResult = {
  ok: boolean;
  accepted: string[];
  rejected: string[];
  messageId?: string;
  error?: string;
};

export async function sendViaCompanyEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<CompanySendResult> {
  if (!companyEmailConfigured()) {
    return { ok: false, accepted: [], rejected: [], error: "not_configured" };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS on 587
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });

  try {
    const info = await transport.sendMail({
      from: companyEmailFrom().header,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    const norm = (list: unknown) =>
      (Array.isArray(list) ? list : [])
        .map((a: any) => String(a?.address || a || "").toLowerCase().trim())
        .filter(Boolean);
    return {
      ok: true,
      accepted: norm(info.accepted),
      rejected: norm(info.rejected),
      messageId: info.messageId,
    };
  } catch (e: any) {
    return { ok: false, accepted: [], rejected: [], error: e?.message || "send_failed" };
  }
}

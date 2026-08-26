import nodemailer from "nodemailer";
import { decryptSecret } from "./secretCrypto";

// Send an email through an inspector's OWN company mailbox (SMTP) instead of
// Resend. Config is per-inspector (saved in inspector_email_settings, password
// encrypted), with the platform env vars as a fallback for the owner.

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
};

export type CompanySendResult = {
  ok: boolean;
  accepted: string[];
  rejected: string[];
  messageId?: string;
  error?: string;
};

// Resolve the SMTP config for a user: their saved (enabled) settings with the
// password decrypted, else the platform env-var fallback, else null.
export async function getInspectorSmtpConfig(admin: any, userId: string): Promise<SmtpConfig | null> {
  try {
    const { data } = await admin
      .from("inspector_email_settings")
      .select("enabled, smtp_host, smtp_port, smtp_user, smtp_pass_encrypted, from_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.enabled && data.smtp_host && data.smtp_user && data.smtp_pass_encrypted) {
      const pass = decryptSecret(data.smtp_pass_encrypted);
      if (pass) {
        return {
          host: String(data.smtp_host),
          port: Number(data.smtp_port || 465),
          user: String(data.smtp_user),
          pass,
          fromEmail: String(data.smtp_user),
          fromName: data.from_name ? String(data.from_name) : undefined,
        };
      }
    }
  } catch {
    /* fall through to env */
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      fromEmail: process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: process.env.SMTP_FROM_NAME || undefined,
    };
  }
  return null;
}

function transportFor(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // implicit TLS on 465; STARTTLS on 587
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

// Check the credentials/connection without sending (for a "Test connection" UI).
export async function verifySmtp(cfg: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await transportFor(cfg).verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "verify_failed" };
  }
}

export async function sendViaSmtp(
  cfg: SmtpConfig,
  opts: { to: string; subject: string; html: string; replyTo?: string },
): Promise<CompanySendResult> {
  try {
    const info = await transportFor(cfg).sendMail({
      from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    const norm = (list: unknown) =>
      (Array.isArray(list) ? list : [])
        .map((a: any) => String(a?.address || a || "").toLowerCase().trim())
        .filter(Boolean);
    return { ok: true, accepted: norm(info.accepted), rejected: norm(info.rejected), messageId: info.messageId };
  } catch (e: any) {
    return { ok: false, accepted: [], rejected: [], error: e?.message || "send_failed" };
  }
}

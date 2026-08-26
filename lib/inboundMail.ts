import { simpleParser } from "mailparser";

// Parses a raw RFC822 email (as delivered by the Cloudflare Email Worker) into
// the normalized shape we store. Receiving is push-based now: Cloudflare Email
// Routing runs a Worker on each incoming message to support@flowinspect.app,
// which POSTs the raw MIME to /api/inbound/email. No mailbox or IMAP needed.

export type InboundMessage = {
  messageId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  bodyText: string;
  snippet: string;
  inReplyTo: string;
  references: string;
  receivedAt: string; // ISO
};

function firstAddress(value: any): { email: string; name: string } {
  const item = value?.value?.[0];
  return {
    email: String(item?.address || "").toLowerCase().trim(),
    name: String(item?.name || "").trim(),
  };
}

// Messages we never surface as a "reply": bounces, auto-responders, and
// anything the platform itself sent.
export function isNoise(fromEmail: string, parsed: any) {
  const from = fromEmail.toLowerCase();
  if (!from) return true;
  if (from.includes("mailer-daemon") || from.includes("postmaster")) return true;
  if (from.endsWith("@flowinspect.app")) return true; // our own automated senders
  const autoSubmitted = String(parsed?.headers?.get?.("auto-submitted") || "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = String(parsed?.headers?.get?.("precedence") || "").toLowerCase();
  if (precedence === "bulk" || precedence === "auto_reply" || precedence === "junk") return true;
  return false;
}

// Returns the normalized message, or null if it's noise / unparseable.
export async function parseRawEmail(raw: Buffer | string): Promise<InboundMessage | null> {
  let parsed: any;
  try {
    parsed = await simpleParser(raw as any);
  } catch {
    return null;
  }

  const from = firstAddress(parsed.from);
  if (isNoise(from.email, parsed)) return null;

  const messageId = String(parsed.messageId || `${from.email}-${Date.now()}`).trim();

  const bodyTextRaw = String(parsed.text || "").trim();
  // Strip the quoted "On ... wrote:" trailer for the snippet so the preview
  // shows what they actually said, not the email they replied to.
  const firstPart = bodyTextRaw.split(/^\s*On .+ wrote:\s*$/m)[0].trim() || bodyTextRaw;
  const bodyText = bodyTextRaw.slice(0, 20000);
  const snippet = firstPart.replace(/\s+/g, " ").slice(0, 600);

  return {
    messageId,
    fromEmail: from.email,
    fromName: from.name,
    subject: String(parsed.subject || "").trim(),
    bodyText,
    snippet,
    inReplyTo: String(parsed.inReplyTo || "").trim(),
    references: Array.isArray(parsed.references)
      ? parsed.references.join(" ")
      : String(parsed.references || "").trim(),
    receivedAt: (parsed.date instanceof Date ? parsed.date : new Date()).toISOString(),
  };
}

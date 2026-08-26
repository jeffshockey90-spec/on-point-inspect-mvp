import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// Reads new messages from the FLOW support mailbox over IMAP (Zoho).
//
// Credentials come from env so nothing sensitive lives in code:
//   ZOHO_IMAP_USER      support@flowinspect.app
//   ZOHO_IMAP_PASSWORD  a Zoho app-specific password (NOT the login password)
//   ZOHO_IMAP_HOST      optional, defaults to imap.zoho.com
//   ZOHO_IMAP_PORT      optional, defaults to 993 (implicit TLS)

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

export function isInboundMailConfigured() {
  return Boolean(process.env.ZOHO_IMAP_USER && process.env.ZOHO_IMAP_PASSWORD);
}

function firstAddress(value: any): { email: string; name: string } {
  const item = value?.value?.[0];
  return {
    email: String(item?.address || "").toLowerCase().trim(),
    name: String(item?.name || "").trim(),
  };
}

// Messages we never want to surface as a "reply": bounces, auto-responders,
// and anything the platform itself sent.
function isNoise(fromEmail: string, parsed: any) {
  const from = fromEmail.toLowerCase();
  if (!from) return true;
  if (from.includes("mailer-daemon") || from.includes("postmaster")) return true;
  if (from === "notifications@flowinspect.app" || from === "support@flowinspect.app") return true;
  if (from.endsWith("@flowinspect.app")) return true; // our own automated senders
  const autoSubmitted = String(parsed?.headers?.get?.("auto-submitted") || "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = String(parsed?.headers?.get?.("precedence") || "").toLowerCase();
  if (precedence === "bulk" || precedence === "auto_reply" || precedence === "junk") return true;
  return false;
}

// Pull messages received in the last `sinceHours` hours. The caller dedupes by
// messageId against the DB, so a generous window is safe (and survives a missed
// cron run) without creating duplicates.
export async function fetchRecentReplies(sinceHours = 48): Promise<InboundMessage[]> {
  const client = new ImapFlow({
    host: process.env.ZOHO_IMAP_HOST || "imap.zoho.com",
    port: Number(process.env.ZOHO_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.ZOHO_IMAP_USER!,
      pass: process.env.ZOHO_IMAP_PASSWORD!,
    },
    logger: false,
  });

  const out: InboundMessage[] = [];
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // SINCE has date (not time) granularity; the caller dedupes by messageId,
      // so re-seeing yesterday's messages is harmless.
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return out;

      for await (const msg of client.fetch(uids, { source: true, envelope: true }, { uid: true })) {
        if (!msg.source) continue;

        let parsed: any;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          continue;
        }

        const from = firstAddress(parsed.from);
        if (isNoise(from.email, parsed)) continue;

        const messageId = String(
          parsed.messageId || msg.envelope?.messageId || `${from.email}-${msg.uid}`,
        ).trim();

        const bodyTextRaw = String(parsed.text || "").trim();
        // Strip the quoted "On ... wrote:" trailer for the snippet so the
        // preview shows what they actually said, not the email they replied to.
        const firstPart = bodyTextRaw.split(/^\s*On .+ wrote:\s*$/m)[0].trim() || bodyTextRaw;
        const bodyText = bodyTextRaw.slice(0, 20000);
        const snippet = firstPart.replace(/\s+/g, " ").slice(0, 600);

        out.push({
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
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return out;
}

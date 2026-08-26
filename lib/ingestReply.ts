import { sendPushNotification } from "./push";
import { OWNER_EMAILS } from "./ownerEmails";
import type { InboundMessage } from "./inboundMail";

function addressOf(row: any) {
  const parts = [
    row?.address || row?.property_address || row?.street || row?.location,
    row?.city,
    row?.state,
    row?.zip || row?.zip_code,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function clientNameOf(row: any) {
  return row?.client_name || row?.client || row?.buyer_name || row?.customer_name || "";
}

// Best-effort: link a reply to the inspection whose client/realtor/inspector
// email matches the sender. Newest match wins.
async function matchInspection(admin: any, fromEmail: string) {
  if (!fromEmail) return null;
  const { data } = await admin
    .from("inspections")
    .select("*")
    .or(
      [
        `client_email.eq.${fromEmail}`,
        `realtor_email.eq.${fromEmail}`,
        `inspector_email.eq.${fromEmail}`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function notifyOwners(reply: {
  fromName: string;
  fromEmail: string;
  subject: string;
  address: string;
}) {
  const who = reply.fromName || reply.fromEmail || "Someone";
  const where = reply.address ? ` · ${reply.address}` : "";
  const cleanSubject = reply.subject ? reply.subject.replace(/^\s*(re:\s*)+/i, "") : "New message";
  const body = `${cleanSubject}${where}`.slice(0, 140);

  const results: any[] = [];
  for (const email of OWNER_EMAILS) {
    try {
      const r = await sendPushNotification({
        title: `💬 Reply from ${who}`,
        body,
        url: "/dashboard/owner/mail",
        eventType: "inbound_reply",
        target: "user",
        targetUserEmail: email,
        ownerEmail: email,
      });
      results.push({ email, sent: r.sent });
    } catch (e: any) {
      results.push({ email, error: e?.message || "push failed" });
    }
  }
  return results;
}

// Dedupe by message_id, match to an inspection, insert, and push the owner.
// Returns { inserted: boolean, duplicate?: boolean, inspectionId?: string|null }.
export async function ingestReply(admin: any, m: InboundMessage) {
  // Already stored? (unique message_id also guards this at the DB level.)
  if (m.messageId) {
    const { data: existing } = await admin
      .from("inbound_replies")
      .select("id")
      .eq("message_id", m.messageId)
      .maybeSingle();
    if (existing) return { inserted: false, duplicate: true };
  }

  const inspection = await matchInspection(admin, m.fromEmail);
  const address = inspection ? addressOf(inspection) : "";
  const matchedName = inspection ? clientNameOf(inspection) : "";
  const inspectionId = inspection?.id ? String(inspection.id) : null;

  const { error } = await admin.from("inbound_replies").insert({
    message_id: m.messageId,
    from_email: m.fromEmail,
    from_name: m.fromName,
    subject: m.subject,
    snippet: m.snippet,
    body_text: m.bodyText,
    in_reply_to: m.inReplyTo,
    refs: m.references,
    received_at: m.receivedAt,
    inspection_id: inspectionId,
    matched_name: matchedName || null,
    is_read: false,
  });

  if (error) {
    if (String(error.code) === "23505") return { inserted: false, duplicate: true };
    throw new Error(error.message);
  }

  const pushes = await notifyOwners({
    fromName: m.fromName,
    fromEmail: m.fromEmail,
    subject: m.subject,
    address,
  });

  return { inserted: true, inspectionId, pushes };
}

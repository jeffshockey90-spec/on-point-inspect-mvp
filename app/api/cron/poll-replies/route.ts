import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { fetchRecentReplies, isInboundMailConfigured } from "../../../../lib/inboundMail";
import { sendPushNotification } from "../../../../lib/push";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Same gate the other crons use: Vercel sends `Authorization: Bearer <CRON_SECRET>`
// automatically. If no secret is configured the endpoint is open (dev).
function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

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
  inspectionId: string | null;
}) {
  const who = reply.fromName || reply.fromEmail || "Someone";
  const where = reply.address ? ` · ${reply.address}` : "";
  const body = `${reply.subject ? reply.subject.replace(/^\s*(re:\s*)+/i, "") : "New message"}${where}`;
  const url = reply.inspectionId ? `/dashboard/owner/mail` : "/dashboard/owner/mail";

  const results = [];
  for (const email of OWNER_EMAILS) {
    try {
      const r = await sendPushNotification({
        title: `💬 Reply from ${who}`,
        body: body.slice(0, 140),
        url,
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

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isInboundMailConfigured()) {
      return NextResponse.json({
        ok: false,
        skipped: "IMAP not configured. Set ZOHO_IMAP_USER and ZOHO_IMAP_PASSWORD.",
      });
    }

    const admin = createAdminClient();
    const messages = await fetchRecentReplies(48);

    if (messages.length === 0) {
      return NextResponse.json({ ok: true, fetched: 0, inserted: 0 });
    }

    // Which of these have we already stored? Dedupe by message_id in one query.
    const ids = messages.map((m) => m.messageId).filter(Boolean);
    const { data: existing } = await admin
      .from("inbound_replies")
      .select("message_id")
      .in("message_id", ids);
    const seen = new Set((existing || []).map((r: any) => String(r.message_id)));

    const fresh = messages.filter((m) => m.messageId && !seen.has(m.messageId));

    let inserted = 0;
    const pushes: any[] = [];

    for (const m of fresh) {
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

      // A duplicate (unique message_id) can slip in on overlapping runs; ignore
      // it rather than double-notifying.
      if (error) {
        if (String(error.code) === "23505") continue;
        console.error("inbound_replies insert error:", error.message);
        continue;
      }

      inserted += 1;
      pushes.push(
        await notifyOwners({
          fromName: m.fromName,
          fromEmail: m.fromEmail,
          subject: m.subject,
          address,
          inspectionId,
        }),
      );
    }

    return NextResponse.json({ ok: true, fetched: messages.length, inserted, pushes });
  } catch (error: any) {
    console.error("poll-replies cron error:", error);
    return NextResponse.json(
      { error: error?.message || "poll-replies failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

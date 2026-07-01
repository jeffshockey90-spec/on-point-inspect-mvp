import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function cleanStatus(value: any) {
  const status = String(value || "").trim();

  const allowed = new Set([
    "agree_to_repair",
    "already_repaired",
    "credit_buyer",
    "decline",
    "needs_discussion",
  ]);

  return allowed.has(status) ? status : "";
}

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

async function sendOwnerPushNotification({
  title,
  body,
  url,
  eventType,
  metadata = {},
}: {
  title: string;
  body: string;
  url: string;
  eventType: string;
  metadata?: Record<string, any>;
}) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

    if (!publicKey || !privateKey) return;

    const supabase = createAdminClient();
    const { data: subscriptions } = await supabase
      .from("app_push_subscriptions")
      .select("*")
      .eq("enabled", true);

    if (!subscriptions?.length) return;

    const webpush = await import("web-push");
    webpush.default.setVapidDetails(subject, publicKey, privateKey);

    let sent = 0;
    let failed = 0;

    for (const row of subscriptions || []) {
      try {
        await webpush.default.sendNotification(
          row.subscription,
          JSON.stringify({ title, body, url, eventType })
        );
        sent += 1;
      } catch (error: any) {
        failed += 1;
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase
            .from("app_push_subscriptions")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("endpoint", row.endpoint);
        }
      }
    }

    await supabase.from("app_notification_logs").insert({
      title,
      body,
      event_type: eventType,
      target_url: url,
      sent_count: sent,
      failed_count: failed,
      metadata,
    });
  } catch (error) {
    console.error("Repair response owner push failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token || "").trim();
    const responses = Array.isArray(body?.responses) ? body.responses : [];

    if (!token) {
      return NextResponse.json({ error: "Missing repair request token." }, { status: 400 });
    }

    if (!responses.length) {
      return NextResponse.json({ error: "No repair request responses submitted." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: share, error: shareError } = await supabase
      .from("repair_request_shares")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Repair request link not found." }, { status: 404 });
    }

    if (share.responded_at) {
      return NextResponse.json(
        { error: "This repair request response has already been submitted." },
        { status: 409 }
      );
    }

    const selectedIds = Array.isArray(share.selected_finding_ids)
      ? share.selected_finding_ids.map((id: any) => String(id))
      : [];

    const rows = responses
      .map((item: any) => {
        const findingId = String(item?.findingId || "").trim();
        const responseStatus = cleanStatus(item?.responseStatus);

        if (!findingId || !responseStatus) return null;
        if (selectedIds.length && !selectedIds.includes(findingId)) return null;

        return {
          share_id: share.id,
          finding_id: findingId,
          response_status: responseStatus,
          notes: String(item?.notes || "").trim() || null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (!rows.length || rows.length !== selectedIds.length) {
      return NextResponse.json(
        { error: "Choose a valid response for every repair request item." },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabase
      .from("repair_request_responses")
      .upsert(rows, {
        onConflict: "share_id,finding_id",
      });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const submittedAt = new Date().toISOString();

    await supabase
      .from("repair_request_shares")
      .update({
        status: "responded",
        responded_at: submittedAt,
      })
      .eq("id", share.id);

    const { data: inspection } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", share.inspection_id)
      .maybeSingle();

    const property = getPropertyLabel(inspection);

    try {
      await supabase.from("audit_logs").insert({
        user_id: null,
        action: "repair_request_response_submitted",
        resource_type: "repair_request_share",
        resource_id: String(share.id),
        metadata: {
          inspection_id: share.inspection_id,
          recipient_email: share.recipient_email,
          response_count: rows.length,
          submitted_at: submittedAt,
        },
      });
    } catch (error) {
      console.error("Repair response audit log failed:", error);
    }

    await sendOwnerPushNotification({
      title: "Repair Response Received",
      body: `${property}: ${rows.length} item${rows.length === 1 ? "" : "s"} answered.`,
      url: `/repair-response/${token}`,
      eventType: "repair_request_response_submitted",
      metadata: {
        inspection_id: share.inspection_id,
        repair_request_share_id: share.id,
        recipient_email: share.recipient_email,
        response_count: rows.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Repair response submitted.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not submit repair response." },
      { status: 500 }
    );
  }
}

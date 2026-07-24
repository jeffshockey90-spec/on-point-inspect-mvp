import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getEventTime(event: any) {
  return (
    event?.created_at ||
    event?.data?.created_at ||
    event?.data?.timestamp ||
    new Date().toISOString()
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.text();

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: "Missing webhook signature headers." },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Missing RESEND_WEBHOOK_SECRET." },
        { status: 500 }
      );
    }

    let event: any;

    try {
      const webhook = new Webhook(process.env.RESEND_WEBHOOK_SECRET);

      event = webhook.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (error: any) {
      console.error("Resend webhook signature error:", error?.message);

      return NextResponse.json(
        { error: "Invalid webhook signature." },
        { status: 400 }
      );
    }

    const type = String(event?.type || event?.event || "").toLowerCase();
    const data = event?.data || event;
    const emailId =
      data?.email_id ||
      data?.emailId ||
      data?.id ||
      data?.message_id ||
      data?.messageId ||
      null;

    if (!emailId) {
      return NextResponse.json({ ok: true, ignored: "Missing email id" });
    }

    const timestamp = getEventTime(event);
    const updates: Record<string, any> = {
      metadata: { resend_webhook_event: event },
    };

    if (type.includes("delivered")) updates.delivered_at = timestamp;
    if (type.includes("opened") || type.includes("open")) updates.opened_at = timestamp;
    if (type.includes("clicked") || type.includes("click")) updates.clicked_at = timestamp;
    if (type.includes("bounced") || type.includes("bounce")) updates.bounced_at = timestamp;
    if (type.includes("failed") || type.includes("failure")) updates.failed_at = timestamp;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ ok: true, ignored: type || "unknown" });
    }

    const { error } = await supabase
      .from("email_logs")
      .update(updates)
      .eq("resend_id", emailId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Resend webhook error:", error);

    return NextResponse.json(
      { error: error?.message || "Webhook failed." },
      { status: 500 }
    );
  }
}

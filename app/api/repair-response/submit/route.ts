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

function cleanText(value: any) {
  return String(value || "").trim();
}

function parseMoneyValue(value: any) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: any) {
  const number = parseMoneyValue(value);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

function buildNotesWithCredit(notes: string, creditAmount: number) {
  const cleanNotes = String(notes || "").trim();

  if (creditAmount <= 0) return cleanNotes || null;

  const creditLine = `Seller Credit Offered: ${formatMoney(creditAmount)}`;

  return cleanNotes ? `${creditLine}\n\n${cleanNotes}` : creditLine;
}

function getSignaturePayload(value: any, submittedAt: string, req: Request) {
  const signatures = value && typeof value === "object" ? value : {};
  const buyer = signatures.buyer && typeof signatures.buyer === "object" ? signatures.buyer : {};
  const seller = signatures.seller && typeof signatures.seller === "object" ? signatures.seller : {};

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  const userAgent = req.headers.get("user-agent") || "";

  return {
    buyer: {
      printed_name: cleanText(buyer.printedName || buyer.printed_name),
      signature: cleanText(buyer.signature),
      signature_image: cleanText(buyer.signatureImage || buyer.signature_image),
      signed_at: cleanText(buyer.signature || buyer.signatureImage || buyer.signature_image) ? submittedAt : null,
    },
    seller: {
      printed_name: cleanText(seller.printedName || seller.printed_name),
      signature: cleanText(seller.signature),
      signature_image: cleanText(seller.signatureImage || seller.signature_image),
      signed_at: cleanText(seller.signature || seller.signatureImage || seller.signature_image) ? submittedAt : null,
    },
    audit: {
      ip_address: ip,
      user_agent: userAgent,
      submitted_at: submittedAt,
      method: "typed_electronic_signature",
    },
  };
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

    const now = new Date().toISOString();
    const signaturePayload = getSignaturePayload(body?.signatures, now, req);

    if (!signaturePayload.seller.printed_name || (!signaturePayload.seller.signature && !signaturePayload.seller.signature_image)) {
      return NextResponse.json(
        { error: "Seller printed name and electronic signature are required." },
        { status: 400 }
      );
    }

    const baseRows = responses
      .map((item: any) => {
        const findingId = String(item?.findingId || "").trim();
        const responseStatus = cleanStatus(item?.responseStatus);
        const creditAmount = parseMoneyValue(item?.creditAmount);

        if (!findingId || !responseStatus) return null;
        if (selectedIds.length && !selectedIds.includes(findingId)) return null;

        return {
          share_id: share.id,
          finding_id: findingId,
          response_status: responseStatus,
          notes: buildNotesWithCredit(String(item?.notes || ""), creditAmount),
          updated_at: now,
          seller_credit_amount: creditAmount,
          credit_amount: creditAmount,
          metadata: {
            item_number: item?.itemNumber || null,
            seller_credit_amount: creditAmount,
          },
        };
      })
      .filter(Boolean) as any[];

    if (!baseRows.length || rowsLengthMismatch(baseRows.length, selectedIds.length)) {
      return NextResponse.json(
        { error: "Choose a valid response for every repair request item." },
        { status: 400 }
      );
    }

    let upsertError: any = null;

    const { error: extendedUpsertError } = await supabase
      .from("repair_request_responses")
      .upsert(baseRows, {
        onConflict: "share_id,finding_id",
      });

    if (extendedUpsertError) {
      const fallbackRows = baseRows.map(
        ({
          seller_credit_amount,
          credit_amount,
          metadata,
          ...row
        }: any) => row
      );

      const { error: fallbackError } = await supabase
        .from("repair_request_responses")
        .upsert(fallbackRows, {
          onConflict: "share_id,finding_id",
        });

      upsertError = fallbackError;
    }

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const submittedAt = now;
    const sellerCreditTotal = baseRows.reduce(
      (sum, row: any) => sum + parseMoneyValue(row.seller_credit_amount),
      0
    );

    const existingMetadata =
      share?.metadata && typeof share.metadata === "object" && !Array.isArray(share.metadata)
        ? share.metadata
        : {};

    const shareUpdateWithCredits = {
      status: "responded",
      responded_at: submittedAt,
      seller_credit_total: sellerCreditTotal,
      metadata: {
        ...existingMetadata,
        seller_credit_total: sellerCreditTotal,
        repair_request_signatures: signaturePayload,
      },
    };

    let shareUpdate = await supabase
      .from("repair_request_shares")
      .update(shareUpdateWithCredits)
      .eq("id", share.id);

    if (shareUpdate.error) {
      shareUpdate = await supabase
        .from("repair_request_shares")
        .update({
          status: "responded",
          responded_at: submittedAt,
          metadata: {
            ...existingMetadata,
            repair_request_signatures: signaturePayload,
          },
        })
        .eq("id", share.id);
    }

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
          response_count: baseRows.length,
          seller_credit_total: sellerCreditTotal,
          submitted_at: submittedAt,
          repair_request_signatures: signaturePayload,
        },
      });
    } catch (error) {
      console.error("Repair response audit log failed:", error);
    }

    await sendOwnerPushNotification({
      title: "Repair Response Received",
      body: `${property}: ${baseRows.length} item${baseRows.length === 1 ? "" : "s"} answered. Seller credit: ${formatMoney(sellerCreditTotal)}.`,
      url: `/repair-response/${token}`,
      eventType: "repair_request_response_submitted",
      metadata: {
        inspection_id: share.inspection_id,
        repair_request_share_id: share.id,
        recipient_email: share.recipient_email,
        response_count: baseRows.length,
        seller_credit_total: sellerCreditTotal,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Repair response submitted.",
      sellerCreditTotal,
      signatures: signaturePayload,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not submit repair response." },
      { status: 500 }
    );
  }
}

function rowsLengthMismatch(rowCount: number, selectedCount: number) {
  return Boolean(selectedCount && rowCount !== selectedCount);
}

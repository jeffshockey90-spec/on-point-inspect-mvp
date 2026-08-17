import { NextResponse } from "next/server";
import { applyAppleEntitlement } from "../../../../lib/revenuecatServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * RevenueCat webhook — ongoing Apple subscription lifecycle.
 *
 * Handles renewals, cancellations, expirations, billing issues, and refunds for
 * subscriptions bought through In-App Purchase (App Store Review Guideline
 * 3.1.1). The immediate post-purchase grant is handled separately by
 * app/api/revenuecat/sync so the inspector isn't left waiting on webhook
 * delivery while standing in someone's basement.
 *
 * Configure in RevenueCat → Integrations → Webhooks with an Authorization header
 * matching REVENUECAT_WEBHOOK_SECRET.
 */

// Events that end entitlement immediately rather than at period end. CANCELLATION
// is deliberately absent: a cancelled subscription stays entitled until it
// expires, and RevenueCat keeps sending the real expiration date.
const REVOKING_EVENTS = new Set(["REFUND", "SUBSCRIPTION_PAUSED", "TRANSFER"]);

export async function POST(req: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Missing REVENUECAT_WEBHOOK_SECRET." }, { status: 500 });
  }

  // RevenueCat sends the configured value verbatim in the Authorization header.
  const provided = req.headers.get("authorization") || "";
  if (provided !== secret && provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = payload?.event;
  if (!event) return NextResponse.json({ error: "Missing event." }, { status: 400 });

  // We configure the RevenueCat app user id to be the Supabase user id at login,
  // so this maps straight onto profiles.id.
  const appUserId: string = event.app_user_id || event.original_app_user_id || "";
  if (!appUserId) {
    return NextResponse.json({ error: "Missing app_user_id." }, { status: 400 });
  }

  const eventType = String(event.type || "").toUpperCase();
  const revoked = REVOKING_EVENTS.has(eventType);

  const expirationMs = Number(event.expiration_at_ms || 0);
  const expiresAt =
    !revoked && Number.isFinite(expirationMs) && expirationMs > 0
      ? new Date(expirationMs).toISOString()
      : null;

  const result = await applyAppleEntitlement(appUserId, {
    // Null expiry revokes: lib/entitlements treats a missing/past date as lapsed.
    expiresAt,
    productId: event.product_id || null,
    originalTransactionId: event.original_transaction_id || null,
    status: eventType || null,
  });

  if (!result.ok) {
    // 500 so RevenueCat retries rather than dropping the state change.
    return NextResponse.json({ error: result.error || "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

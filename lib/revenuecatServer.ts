import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Server-side RevenueCat helpers.
 *
 * Two things write Apple entitlement state onto a profile:
 *   - app/api/revenuecat/webhook  — ongoing renewals, cancellations, expirations
 *   - app/api/revenuecat/sync     — called right after a purchase completes, so
 *                                   access is granted immediately instead of
 *                                   waiting on webhook delivery
 *
 * Both funnel through `applyAppleEntitlement` so the write is identical.
 */

export const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

export function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export type AppleEntitlement = {
  expiresAt: string | null;
  productId: string | null;
  originalTransactionId: string | null;
  status: string | null;
};

/**
 * Write Apple subscription state onto a profile.
 *
 * Deliberately never touches `subscription_status` — that column belongs to
 * Stripe. A user can hold both; entitlement is the OR of the two (lib/entitlements).
 */
export async function applyAppleEntitlement(
  userId: string,
  entitlement: AppleEntitlement
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({
      apple_subscription_status: entitlement.status,
      apple_expires_at: entitlement.expiresAt,
      apple_product_id: entitlement.productId,
      apple_original_transaction_id: entitlement.originalTransactionId,
      revenuecat_app_user_id: userId,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Read a subscriber's current entitlement straight from RevenueCat.
 *
 * Used by the post-purchase sync: the client can tell us a purchase succeeded,
 * but we never trust the client for entitlement — we ask RevenueCat and write
 * whatever it says.
 */
export async function fetchAppleEntitlement(appUserId: string): Promise<AppleEntitlement | null> {
  const secret = process.env.REVENUECAT_SECRET_KEY;
  if (!secret) throw new Error("Missing REVENUECAT_SECRET_KEY.");

  const res = await fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    // 404 means RevenueCat has never seen this user — no purchase, not an error.
    if (res.status === 404) return null;
    throw new Error(`RevenueCat subscriber lookup failed (${res.status}).`);
  }

  const json = await res.json();
  const subscriber = json?.subscriber;
  if (!subscriber) return null;

  const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID || "pro";
  const entitlement = subscriber?.entitlements?.[entitlementId];

  // Fall back to the raw subscription list if the entitlement isn't configured
  // under the expected id, so a naming mismatch degrades rather than locking out.
  const subscriptions: Record<string, any> = subscriber?.subscriptions || {};
  const latest = Object.entries(subscriptions)
    .map(([productId, value]) => ({ productId, ...(value as any) }))
    .sort(
      (a, b) =>
        new Date(b?.expires_date || 0).getTime() - new Date(a?.expires_date || 0).getTime()
    )[0];

  const expiresAt = entitlement?.expires_date || latest?.expires_date || null;
  if (!expiresAt) return null;

  return {
    expiresAt,
    productId: entitlement?.product_identifier || latest?.productId || null,
    originalTransactionId: latest?.original_transaction_id || null,
    status: "synced",
  };
}

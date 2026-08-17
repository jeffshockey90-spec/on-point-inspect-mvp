/**
 * Which billing source, if any, currently entitles an account.
 *
 * An inspector can be entitled by Stripe (bought on the web or Android) or by
 * Apple In-App Purchase (bought inside the iOS app). App Store Review Guideline
 * 3.1.1 requires the iOS purchase path to exist; 3.1.3(b) lets us keep honoring
 * the Stripe one, so both are valid at once and neither overwrites the other.
 *
 * Mirrors `can_create_inspection()` in supabase/add-apple-iap.sql. If you change
 * the rules here, change them there too — the database enforces the same gate on
 * insert, and a mismatch either locks out a paying customer or lets a lapsed one
 * through.
 */

export type BillingSource = "exempt" | "stripe" | "apple" | "trial" | "none";

export type EntitlementProfile = {
  subscription_status?: string | null;
  subscription_exempt?: boolean | null;
  subscription_required?: boolean | null;
  apple_expires_at?: string | null;
  free_inspection_limit?: number | null;
  free_inspections_used?: number | null;
} | null;

export function isStripeActive(profile: EntitlementProfile): boolean {
  const status = String(profile?.subscription_status || "").toLowerCase();
  return status === "active" || status === "trialing";
}

/**
 * RevenueCat's expiration date already folds in grace and billing-retry periods,
 * so a future expiry is the entitlement — we don't also test the event type,
 * which would lock someone out mid-grace-period after a billing issue.
 */
export function isAppleActive(profile: EntitlementProfile): boolean {
  const expires = profile?.apple_expires_at;
  if (!expires) return false;

  const expiresAt = new Date(expires).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function isExempt(profile: EntitlementProfile): boolean {
  return profile?.subscription_exempt === true || profile?.subscription_required === false;
}

/** True when the account may create inspections right now, for any reason. */
export function isEntitled(profile: EntitlementProfile, usedOverride?: number): boolean {
  if (isExempt(profile) || isStripeActive(profile) || isAppleActive(profile)) return true;
  return getFreeRemaining(profile, usedOverride) > 0;
}

export function getFreeRemaining(profile: EntitlementProfile, usedOverride?: number): number {
  const limit = Number(profile?.free_inspection_limit ?? 3);
  const used = Math.max(
    Number(profile?.free_inspections_used ?? 0),
    Number(usedOverride ?? 0)
  );
  return Math.max(0, limit - used);
}

/** What is paying for this account — drives which management UI to show. */
export function getBillingSource(profile: EntitlementProfile, usedOverride?: number): BillingSource {
  if (isExempt(profile)) return "exempt";
  // Apple first: if someone somehow holds both, the App Store subscription is the
  // one iOS can actually manage, so surfacing it avoids a dead "Manage" button.
  if (isAppleActive(profile)) return "apple";
  if (isStripeActive(profile)) return "stripe";
  if (getFreeRemaining(profile, usedOverride) > 0) return "trial";
  return "none";
}

import { isIOSNativeApp } from "./nativePlatform";

/**
 * Client-side RevenueCat setup for Apple In-App Purchase.
 *
 * Only ever runs inside the native iOS shell — web and Android keep using Stripe
 * (App Store Review Guideline 3.1.3(b) lets us honor those purchases on iOS, so
 * a web subscriber opening the app never sees a purchase prompt at all).
 *
 * The SDK is imported dynamically so the Capacitor plugin never loads in a
 * browser, where its native bridge doesn't exist.
 */

let configuredFor: string | null = null;

export type PurchasePackage = {
  identifier: string;
  priceString: string;
  title: string;
  raw: any;
};

async function loadSdk() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

/**
 * Configure the SDK for a signed-in user, once per user per session.
 *
 * The RevenueCat app user id is set to the Supabase user id so webhook events
 * (app/api/revenuecat/webhook) map straight onto profiles.id — without this the
 * purchase would land on an anonymous id and never reach the account.
 */
export async function ensureConfigured(userId: string): Promise<boolean> {
  if (!isIOSNativeApp() || !userId) return false;
  if (configuredFor === userId) return true;

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) return false;

  const Purchases = await loadSdk();
  await Purchases.configure({ apiKey, appUserID: userId });
  configuredFor = userId;
  return true;
}

/** The subscription packages available to buy, from the current RevenueCat offering. */
export async function getAvailablePackages(userId: string): Promise<PurchasePackage[]> {
  if (!(await ensureConfigured(userId))) return [];

  const Purchases = await loadSdk();
  const offerings = await Purchases.getOfferings();
  const packages = offerings?.current?.availablePackages || [];

  return packages.map((pkg: any) => ({
    identifier: pkg.identifier,
    priceString: pkg.product?.priceString || "",
    title: pkg.product?.title || "FLOW Professional",
    raw: pkg,
  }));
}

/** Returns true when the purchase completed and the user is entitled. */
export async function purchase(userId: string, pkg: PurchasePackage): Promise<boolean> {
  if (!(await ensureConfigured(userId))) return false;

  const Purchases = await loadSdk();
  const result: any = await Purchases.purchasePackage({ aPackage: pkg.raw });
  return hasActiveEntitlement(result?.customerInfo);
}

/** Restore purchases — required by App Store Review Guideline 3.1.1 for any IAP. */
export async function restore(userId: string): Promise<boolean> {
  if (!(await ensureConfigured(userId))) return false;

  const Purchases = await loadSdk();
  const result: any = await Purchases.restorePurchases();
  return hasActiveEntitlement(result?.customerInfo);
}

function hasActiveEntitlement(customerInfo: any): boolean {
  const active = customerInfo?.entitlements?.active || {};
  return Object.keys(active).length > 0;
}

/**
 * Tell the server to re-read entitlement from RevenueCat and persist it.
 *
 * Called after a purchase or restore so access is granted immediately rather
 * than whenever the webhook happens to arrive.
 */
export async function syncEntitlement(): Promise<boolean> {
  const res = await fetch("/api/revenuecat/sync", { method: "POST" });
  if (!res.ok) return false;

  const json = await res.json().catch(() => null);
  return Boolean(json?.active);
}

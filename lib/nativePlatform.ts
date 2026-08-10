import { Capacitor } from "@capacitor/core";

/**
 * True when the web app is running inside the native iOS Capacitor shell.
 *
 * Used to hide every in-app purchase / subscription-purchase control and
 * purchase call-to-action on iOS, so the app complies with App Store Review
 * Guideline 3.1.1 (no purchasing mechanisms or CTAs other than In-App Purchase
 * inside the iOS app). Web and Android are unaffected — the FLOW subscription
 * is a B2B service sold on the web.
 */
export function isIOSNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
      return true;
    }
  } catch {
    // Fall back to the injected global bridge below.
  }

  const capacitor = (window as any).Capacitor;
  const platform = capacitor?.getPlatform?.();

  return Boolean(
    capacitor?.isNativePlatform?.() &&
      (platform === "ios" || platform === "iphone" || platform === "ipad"),
  );
}

/**
 * Open a URL in the device's external browser (Safari), leaving the app.
 *
 * In the Capacitor iOS shell, `window.open(url, "_blank")` is routed to the
 * system browser rather than the in-app web view — this is what makes the
 * subscription purchase happen on the web, outside the app, as required for a
 * compliant external-purchase link. `path` may be absolute or app-relative.
 */
export function openInSystemBrowser(path: string): void {
  if (typeof window === "undefined") return;
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
  window.open(url, "_blank");
}

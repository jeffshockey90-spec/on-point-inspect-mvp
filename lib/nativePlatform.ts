import { Capacitor } from "@capacitor/core";

/**
 * True when the web app is running inside the native iOS Capacitor shell.
 *
 * Used to suppress every purchase control, subscription price, and pointer to an
 * outside purchase on iOS, so the app complies with App Store Review Guideline
 * 3.1.1 / 3.1.3 (no purchasing mechanism other than In-App Purchase, and no CTA
 * steering to one). Web and Android are unaffected.
 *
 * This is the client-side check. Server components use `isIOSShellRequest()`
 * from `lib/iosShell`, which reads the shell's user-agent marker and so can skip
 * the markup entirely rather than hiding it after hydration.
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


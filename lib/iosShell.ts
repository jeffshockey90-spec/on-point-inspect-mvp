import { headers } from "next/headers";

/**
 * Marker appended to the WKWebView user-agent by the native iOS shell.
 *
 * Set in `capacitor.config.ts` under `ios.appendUserAgent`. Changing it here
 * without changing it there (or shipping a native build that predates it) makes
 * `isIOSShellRequest` fall back to `false`, so keep the two in sync.
 */
export const IOS_SHELL_UA_TAG = "FlowInspectIOS";

/**
 * True when the current request came from the native iOS Capacitor shell.
 *
 * The iOS app loads the live site through `server.url`, so every page of the
 * web app is reachable inside the App Store build. App Review treats all of it
 * as "in the app", which means subscription pricing, purchase CTAs, and any
 * pointer to an outside purchase have to be suppressed on iOS (App Store Review
 * Guideline 3.1.1 / 3.1.3). Server components can't read the Capacitor bridge,
 * so they detect the shell from the user-agent instead and never render that
 * markup in the first place — no flash of purchase content before hydration.
 *
 * Client components use `isIOSNativeApp()` from `lib/nativePlatform` instead,
 * which reads the Capacitor bridge directly.
 */
export async function isIOSShellRequest(): Promise<boolean> {
  try {
    const headerList = await headers();
    return (headerList.get("user-agent") || "").includes(IOS_SHELL_UA_TAG);
  } catch {
    // headers() throws outside a request scope (e.g. static generation).
    return false;
  }
}

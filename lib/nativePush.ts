/**
 * Native push listeners, registered once per app session.
 *
 * These used to live inside NativePushSetup, which is rendered only on
 * /settings and /dashboard/owner, and were only attached when the user pressed
 * "Enable notifications". So the tap handler existed in the session where push
 * was switched on and was gone after the next launch — and tapping a
 * notification from a cold start IS a launch. The URL rode in on the payload
 * and was silently dropped, which is why an alert opened the app to whatever
 * screen it felt like instead of the thing the alert was about.
 *
 * One registration path now, owned here and started on boot by
 * components/NativeDeepLinks. The settings UI drives permission and watches the
 * events below for its status; it must never register its own listeners, since
 * the previous implementation opened with removeAllListeners() and would tear
 * these down.
 */

export const PUSH_TOKEN_EVENT = "onpoint:push-token";
export const PUSH_ERROR_EVENT = "onpoint:push-error";
export const PUSH_ACTION_EVENT = "onpoint:push-action";
export const DEEP_LINK_EVENT = "onpoint:native-deeplink";

export function isNativeCapacitorApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Turn whatever the payload carried into an in-app route. */
export function normalizeDeepLink(rawUrl: any): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";

  const appBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flowinspect.app";

  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      const parsed = new URL(rawUrl);
      const base = new URL(appBase);
      if (parsed.host === base.host) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return rawUrl;
    }
    if (rawUrl.startsWith("/")) return rawUrl;
    return `/${rawUrl}`;
  } catch {
    return "";
  }
}

/**
 * The destination, wherever the platform decided to put it. APNs custom keys
 * land on `data` in the Capacitor schema, but older payloads and Android have
 * used `extra` and a few different key names, so check them all rather than
 * lose the tap.
 */
export function getPushUrl(event: any): string {
  const notification = event?.notification || event || {};
  const data = notification?.data || {};
  const extra = notification?.extra || {};

  return (
    data?.url ||
    data?.link ||
    data?.deepLink ||
    data?.deep_link ||
    data?.route ||
    extra?.url ||
    extra?.link ||
    extra?.deepLink ||
    extra?.deep_link ||
    extra?.route ||
    notification?.url ||
    notification?.link ||
    ""
  );
}

function emit(name: string, detail: any) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Ask the app shell to navigate. NativeDeepLinks owns the router. */
export function requestNavigation(rawUrl: any) {
  const route = normalizeDeepLink(rawUrl);
  if (!route) return;
  emit(DEEP_LINK_EVENT, { url: route });
}

let listenersPromise: Promise<boolean> | null = null;

/**
 * Attach the push listeners, at most once per session.
 *
 * Safe to call from anywhere and as often as you like — the promise is cached,
 * so the settings screen and the boot-time listener converge on one
 * registration. Capacitor queues a tap that arrived before any listener
 * attached and delivers it once one does, which is what makes a cold-start tap
 * land on the right screen.
 */
export function ensureNativePushListeners(): Promise<boolean> {
  if (!isNativeCapacitorApp()) return Promise.resolve(false);
  if (listenersPromise) return listenersPromise;

  listenersPromise = (async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      await PushNotifications.addListener("registration", (registration: any) => {
        emit(PUSH_TOKEN_EVENT, { token: registration?.value || "" });
      });

      await PushNotifications.addListener("registrationError", (error: any) => {
        emit(PUSH_ERROR_EVENT, { error: error?.error || "Native push registration failed." });
      });

      await PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
        emit(PUSH_ACTION_EVENT, { ...(notification?.data || {}), actionId: "received" });
      });

      await PushNotifications.addListener("pushNotificationActionPerformed", (event: any) => {
        const data = event?.notification?.data || event?.notification?.extra || {};
        emit(PUSH_ACTION_EVENT, { ...data, actionId: event?.actionId || "tap" });
        requestNavigation(getPushUrl(event));
      });

      return true;
    } catch (error) {
      // A web build or a shell without the plugin: nothing to attach.
      listenersPromise = null;
      console.warn("Native push listeners unavailable:", error);
      return false;
    }
  })();

  return listenersPromise;
}

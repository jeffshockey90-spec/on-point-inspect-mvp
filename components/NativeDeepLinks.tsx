"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DEEP_LINK_EVENT,
  ensureNativePushListeners,
  isNativeCapacitorApp,
  requestNavigation,
} from "../lib/nativePush";

/**
 * Boots native push + universal-link handling for the whole app.
 *
 * Mounted once in the root layout (via DeferredGlobals). This exists because
 * both used to be wired up inside NativePushSetup, which only renders on
 * /settings and /dashboard/owner — so tapping an alert from any other screen,
 * or from a cold start, had no listener to receive it and the notification's
 * destination was thrown away.
 *
 * Renders nothing. It only listens.
 */
export default function NativeDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeCapacitorApp()) return;

    let cancelled = false;
    let appListener: any;

    function onDeepLink(event: Event) {
      const route = (event as CustomEvent)?.detail?.url;
      if (typeof route !== "string" || !route) return;
      if (route.startsWith("/")) {
        router.push(route);
      } else {
        window.location.href = route;
      }
    }

    window.addEventListener(DEEP_LINK_EVENT, onDeepLink as EventListener);

    (async () => {
      // Attach push listeners regardless of whether permission is granted yet.
      // They cost nothing when no notification arrives, and attaching early is
      // the whole point: Capacitor holds a tap that landed before boot finished
      // and delivers it as soon as a listener exists.
      await ensureNativePushListeners();

      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        appListener = await App.addListener("appUrlOpen", (event: any) => {
          requestNavigation(event?.url);
        });

        // A universal link that launched the app cold is waiting here rather
        // than arriving through the listener.
        const launch = await App.getLaunchUrl().catch(() => null);
        if (!cancelled && launch?.url) requestNavigation(launch.url);
      } catch (error) {
        console.warn("Capacitor App link listener unavailable:", error);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(DEEP_LINK_EVENT, onDeepLink as EventListener);
      try {
        appListener?.remove?.();
      } catch {}
    };
  }, [router]);

  return null;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NativePushStatus =
  | "checking"
  | "not_native"
  | "ready"
  | "permission_denied"
  | "registered"
  | "failed";

function isNativeCapacitorApp() {
  if (typeof window === "undefined") return false;

  const capacitor = (window as any).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function getNativePlatform() {
  if (typeof window === "undefined") return "web";

  const capacitor = (window as any).Capacitor;

  try {
    return capacitor?.getPlatform?.() || "ios";
  } catch {
    return "ios";
  }
}

function normalizeDeepLink(rawUrl: any) {
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
    return rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  }
}

function getPushUrl(event: any) {
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

export default function NativePushSetup() {
  const router = useRouter();
  const listenersReadyRef = useRef(false);

  const [status, setStatus] = useState<NativePushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  const nativeApp = useMemo(() => isNativeCapacitorApp(), []);

  function openDeepLink(rawUrl: any) {
    const route = normalizeDeepLink(rawUrl);
    if (!route || typeof window === "undefined") return;

    if (route.startsWith("/")) {
      router.push(route);
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("onpoint:native-deeplink", {
            detail: { url: route },
          })
        );
      }, 250);
      return;
    }

    window.location.href = route;
  }

  useEffect(() => {
    if (!nativeApp) {
      setStatus("not_native");
      return;
    }

    setStatus("ready");

    let appListener: any;

    async function setupAppLinkListener() {
      try {
        const appModule = await import("@capacitor/app");
        const { App } = appModule;

        appListener = await App.addListener("appUrlOpen", (event: any) => {
          openDeepLink(event?.url);
        });

        const launchUrl = await App.getLaunchUrl().catch(() => null);
        if (launchUrl?.url) {
          openDeepLink(launchUrl.url);
        }
      } catch (error) {
        console.warn("Capacitor App link listener unavailable:", error);
      }
    }

    setupAppLinkListener();

    return () => {
      listenersReadyRef.current = false;

      try {
        appListener?.remove?.();
      } catch {}
    };
  }, [nativeApp]);

  async function saveNativeToken(deviceToken: string) {
    const res = await fetch("/api/push/native-subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: deviceToken,
        platform: getNativePlatform(),
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Failed to save native push token.");
    }

    return data;
  }

  async function setupListeners(PushNotifications: any) {
    if (listenersReadyRef.current) return;

    listenersReadyRef.current = true;

    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener("registration", async (registration: any) => {
      const deviceToken = registration.value;

      setToken(deviceToken);

      try {
        await saveNativeToken(deviceToken);
        setStatus("registered");
        setMessage("Native Apple push notifications are enabled for this device.");
      } catch (error: any) {
        setStatus("failed");
        setMessage(error?.message || "Token received, but failed to save.");
      } finally {
        setBusy(false);
      }
    });

    await PushNotifications.addListener("registrationError", (error: any) => {
      console.error("Native push registration error:", error);
      setStatus("failed");
      setMessage(error?.error || "Native push registration failed.");
      setBusy(false);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      console.log("Push received:", notification);
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (event: any) => {
      console.log("Push action performed:", event);
      const notification = event?.notification || {};
      const data = notification?.data || notification?.extra || {};
      window.dispatchEvent(new CustomEvent("onpoint:push-action", { detail: { ...data, actionId: event?.actionId || "tap" } }));
      openDeepLink(getPushUrl(event));
    });
  }

  async function enableNativePush() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (!nativeApp) {
        setStatus("not_native");
        setMessage("Native push only works inside the App Store iOS app.");
        return;
      }

      const pushModule = await import("@capacitor/push-notifications");
      const { PushNotifications } = pushModule;

      await setupListeners(PushNotifications);

      const currentPermissions = await PushNotifications.checkPermissions();

      let permissions = currentPermissions;

      if (currentPermissions.receive !== "granted") {
        permissions = await PushNotifications.requestPermissions();
      }

      if (permissions.receive !== "granted") {
        setStatus("permission_denied");
        setMessage("Notification permission was not granted.");
        setBusy(false);
        return;
      }

      setMessage("Registering with Apple Push Notifications...");
      await PushNotifications.register();
    } catch (error: any) {
      console.error("Enable native push error:", error);
      setStatus("failed");
      setMessage(error?.message || "Failed to enable native push notifications.");
      setBusy(false);
    }
  }

  async function sendNativeTest() {
    if (testing) return;

    setTesting(true);
    setMessage("");

    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "FLOW",
          body: "Native iOS push test from FLOW.",
          url: "/schedule",
          eventType: "native_test",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send native test.");
      }

      setMessage(
        `Test sent. Native: ${data.nativeSent || 0}, Web: ${data.webSent || 0}, Failed: ${data.failed || 0}.`
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to send native test.");
    } finally {
      setTesting(false);
    }
  }

  if (status === "not_native") {
    return (
      <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4 text-sm text-slate-400">
        Native Apple push is only available inside the iOS App Store app. Web push still works in supported browsers.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          Native iOS Push
        </p>

        <p className="mt-2 text-lg font-black text-white">
          {status === "registered"
            ? "Enabled"
            : status === "permission_denied"
              ? "Permission Denied"
              : status === "failed"
                ? "Failed"
                : "Ready"}
        </p>

        {token && (
          <p className="mt-1 break-all text-xs text-slate-500">
            Token saved: {token.slice(0, 18)}...
          </p>
        )}
      </div>

      {message && (
        <div
          className={`rounded-xl border p-3 text-sm font-bold ${
            status === "registered"
              ? "border-green-500/40 bg-green-950/30 text-green-300"
              : status === "failed" || status === "permission_denied"
                ? "border-red-500/40 bg-red-950/30 text-red-300"
                : "border-yellow-500/40 bg-yellow-950/30 text-yellow-200"
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={enableNativePush}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {busy ? "Enabling..." : status === "registered" ? "Re-Sync Native Push" : "Enable Native iOS Push"}
        </button>

        <button
          type="button"
          onClick={sendNativeTest}
          disabled={testing || status !== "registered"}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {testing && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {testing ? "Sending..." : "Send Native Test"}
        </button>
      </div>
    </div>
  );
}

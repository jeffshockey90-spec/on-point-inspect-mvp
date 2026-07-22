"use client";

import { useEffect, useMemo, useState } from "react";
import NativePushSetup from "./NativePushSetup";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function isNativeCapacitorApp() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as any).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function StatusPill({ enabled, supported }: { enabled: boolean; supported: boolean }) {
  const label = enabled ? "Web Push On" : supported ? "Ready" : "Not Supported";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${
        enabled
          ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
          : supported
            ? "border-blue-400/50 bg-blue-500/10 text-blue-300"
            : "border-red-400/50 bg-red-500/10 text-red-300"
      }`}
    >
      {label}
    </span>
  );
}

export default function PushNotificationSetup() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const nativeApp = useMemo(() => isNativeCapacitorApp(), []);

  const vapidPublicKey = useMemo(() => {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  }, []);

  useEffect(() => {
    const isSupported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setSupported(isSupported);

    if (isSupported) {
      setPermission(Notification.permission);

      navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setEnabled(Boolean(subscription)))
        .catch(() => {});
    }
  }, []);

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function enablePush() {
    if (busy) return;

    if (!supported) {
      showMessage("error", "Web push notifications are not supported on this device/browser.");
      return;
    }

    if (!vapidPublicKey) {
      showMessage(
        "error",
        "Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY. Add VAPID keys before enabling web push notifications."
      );
      return;
    }

    setBusy(true);
    setMessage("");
    setMessageType("");

    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        showMessage("error", "Notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;

      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription,
          userAgent: navigator.userAgent,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to save push subscription.");
      }

      setEnabled(true);
      showMessage("success", "Web push notifications enabled for this device.");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to enable web push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTestPush() {
    if (busy) return;

    setBusy(true);
    setMessage("");
    setMessageType("");

    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "FLOW",
          body: nativeApp
            ? "Test notification from the iOS app."
            : "Test notification from Owner Dashboard.",
          url: "/dashboard/owner",
          eventType: nativeApp ? "native_owner_test" : "web_owner_test",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send test notification.");
      }

      showMessage(
        "success",
        `Test sent. Total: ${data.sent || 0}, Web: ${data.webSent || 0}, Native: ${data.nativeSent || 0}, Failed: ${data.failed || 0}.`
      );
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to send test notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <NativePushSetup />

      <section className="overflow-hidden rounded-3xl border border-slate-700/80 bg-[#0b1220] shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-5 border-b border-slate-800/90 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              Web Push
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Browser Push Notifications
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Enable alerts for this browser so you can receive booking, support, payment, and report activity notifications even when you are not on the page.
            </p>
          </div>

          <StatusPill enabled={enabled} supported={supported} />
        </div>

        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-700/80 bg-[#020817] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Device Status
            </p>
            <p className="mt-2 text-lg font-black text-white">
              {enabled ? "Connected" : supported ? "Ready to Connect" : "Unavailable"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {enabled
                ? "This browser is registered for web push alerts."
                : supported
                  ? "This browser supports push notifications."
                  : "This browser does not support web push notifications."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-[#020817] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Permission
            </p>
            <p className="mt-2 text-lg font-black capitalize text-white">
              {permission}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Browser permission controls whether FLOW can show notifications on this device.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-[#020817] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Alerts Included
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Bookings", "Payments", "Reports", "Support"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {message && (
          <div className="px-5 pb-5 sm:px-6">
            <div
              className={`rounded-2xl border p-4 text-sm font-bold leading-6 ${
                messageType === "success"
                  ? "border-green-500/40 bg-green-950/30 text-green-300"
                  : "border-red-500/40 bg-red-950/30 text-red-300"
              }`}
            >
              {message}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-800/90 p-5 sm:flex-row sm:p-6">
          <button
            type="button"
            onClick={enablePush}
            disabled={busy || !supported}
            aria-busy={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
          >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {enabled ? "Re-Sync Web Device" : "Enable Web Push"}
          </button>

          <button
            type="button"
            onClick={sendTestPush}
            disabled={busy || (!enabled && !nativeApp)}
            className="inline-flex w-full items-center justify-center rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
          >
            Send Test To All Devices
          </button>
        </div>
      </section>
    </div>
  );
}

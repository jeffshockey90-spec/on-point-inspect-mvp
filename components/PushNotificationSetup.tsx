"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function PushNotificationSetup() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

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
      showMessage("error", "Push notifications are not supported on this device/browser.");
      return;
    }

    if (!vapidPublicKey) {
      showMessage(
        "error",
        "Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY. Add VAPID keys before enabling push notifications."
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
      showMessage("success", "Push notifications enabled for this device.");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to enable push notifications.");
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
          title: "On Point Inspect",
          body: "Test notification from Owner Dashboard.",
          url: "/dashboard/owner",
          eventType: "test",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send test notification.");
      }

      showMessage("success", `Test notification sent to ${data.sent || 0} device(s).`);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to send test notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Status</p>
        <p className="mt-2 text-lg font-black text-white">
          {enabled ? "Enabled" : supported ? "Ready" : "Not Supported"}
        </p>
        <p className="mt-1 text-sm text-slate-400">Permission: {permission}</p>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-3 text-sm font-bold ${
            messageType === "success"
              ? "border-green-500/40 bg-green-950/30 text-green-300"
              : "border-red-500/40 bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={enablePush}
          disabled={busy || !supported}
          aria-busy={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {enabled ? "Re-Sync Device" : "Enable Push"}
        </button>

        <button
          type="button"
          onClick={sendTestPush}
          disabled={busy || !enabled}
          className="inline-flex items-center justify-center rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          Send Test
        </button>
      </div>
    </div>
  );
}

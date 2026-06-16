"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function NativePushSetup() {
  const [status, setStatus] = useState<NativePushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  const nativeApp = useMemo(() => isNativeCapacitorApp(), []);

  useEffect(() => {
    if (!nativeApp) {
      setStatus("not_native");
      return;
    }

    setStatus("ready");
  }, [nativeApp]);

  async function saveNativeToken(deviceToken: string) {
    const res = await fetch("/api/push/native-subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: deviceToken,
        platform: "ios",
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

      PushNotifications.removeAllListeners();

      await PushNotifications.addListener("registration", async (registration) => {
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

      await PushNotifications.addListener("registrationError", (error) => {
        console.error("Native push registration error:", error);
        setStatus("failed");
        setMessage(error?.error || "Native push registration failed.");
        setBusy(false);
      });

      await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        console.log("Push received:", notification);
      });

      await PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
        const url = notification.notification?.data?.url;

        if (url && typeof window !== "undefined") {
          window.location.href = url;
        }
      });

      const permissions = await PushNotifications.requestPermissions();

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
              : "border-yellow-500/40 bg-yellow-950/30 text-yellow-200"
          }`}
        >
          {message}
        </div>
      )}

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
    </div>
  );
}

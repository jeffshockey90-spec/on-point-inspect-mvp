"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ensureNativePushListeners,
  PUSH_ERROR_EVENT,
  PUSH_TOKEN_EVENT,
} from "../lib/nativePush";

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

// Persists the device's APNs token to the backend. Registration itself now
// lives in lib/nativePush (which emits PUSH_TOKEN_EVENT); this screen saves it.
async function saveNativeToken(deviceToken: string) {
  const res = await fetch("/api/push/native-subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: deviceToken,
      platform: getNativePlatform(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Failed to save native push token.");
  }

  return data;
}

export default function NativePushSetup() {

  const [status, setStatus] = useState<NativePushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  const nativeApp = useMemo(() => isNativeCapacitorApp(), []);

  // Token + error arrive as events now that registration lives in
  // lib/nativePush, so this screen still reports what happened without
  // owning a listener.
  useEffect(() => {
    function onToken(event: Event) {
      const value = (event as CustomEvent)?.detail?.token || "";
      setToken(value);
      saveNativeToken(value)
        .then(() => {
          setStatus("registered");
          setMessage("Native Apple push notifications are enabled for this device.");
        })
        .catch((error: any) => {
          setStatus("failed");
          setMessage(error?.message || "Token received, but failed to save.");
        })
        .finally(() => setBusy(false));
    }

    function onError(event: Event) {
      setStatus("failed");
      setMessage((event as CustomEvent)?.detail?.error || "Native push registration failed.");
      setBusy(false);
    }

    window.addEventListener(PUSH_TOKEN_EVENT, onToken as EventListener);
    window.addEventListener(PUSH_ERROR_EVENT, onError as EventListener);
    return () => {
      window.removeEventListener(PUSH_TOKEN_EVENT, onToken as EventListener);
      window.removeEventListener(PUSH_ERROR_EVENT, onError as EventListener);
    };
  }, []);

  useEffect(() => {
    setStatus(nativeApp ? "ready" : "not_native");
  }, [nativeApp]);

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

      // Listeners are owned by lib/nativePush and already attached at boot;
      // this is a no-op when they are. Registering a second set here would
      // mean two navigations per tap.
      await ensureNativePushListeners();

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
      <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm text-[var(--fl-muted)]">
        Native Apple push is only available inside the iOS App Store app. Web push still works in supported browsers.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
          Native iOS Push
        </p>

        <p className="mt-2 text-lg font-semibold text-[var(--fl-text)]">
          {status === "registered"
            ? "Enabled"
            : status === "permission_denied"
              ? "Permission Denied"
              : status === "failed"
                ? "Failed"
                : "Ready"}
        </p>

        {token && (
          <p className="mt-1 break-all text-xs text-[var(--fl-faint)]">
            Token saved: {token.slice(0, 18)}...
          </p>
        )}
      </div>

      {message && (
        <div
          className={`rounded-xl border p-3 text-sm font-bold ${
            status === "registered"
              ? "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]"
              : status === "failed" || status === "permission_denied"
                ? "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]"
                : "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]"
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
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
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
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
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

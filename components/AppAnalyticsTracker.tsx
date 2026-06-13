"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "server";

  const key = "onpoint_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(key, next);
  return next;
}

async function trackAppEvent(eventType: string, path: string) {
  try {
    const deviceId = getOrCreateDeviceId();

    await fetch("/api/app-analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify({
        eventType,
        path,
        deviceId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        standalone:
          window.matchMedia?.("(display-mode: standalone)")?.matches ||
          (navigator as any).standalone === true,
      }),
    });
  } catch (error) {
    console.error("App analytics tracking error:", error);
  }
}

export default function AppAnalyticsTracker() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    const hasOpened = window.localStorage.getItem("onpoint_first_open_tracked");

    if (!hasOpened) {
      window.localStorage.setItem("onpoint_first_open_tracked", "true");
      trackAppEvent("first_open", pathname);
      return;
    }

    trackAppEvent("page_view", pathname);
  }, [pathname]);

  useEffect(() => {
    function handleBeforeInstallPrompt() {
      trackAppEvent("install_prompt", pathname);
    }

    function handleAppInstalled() {
      trackAppEvent("pwa_install", pathname);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [pathname]);

  return null;
}

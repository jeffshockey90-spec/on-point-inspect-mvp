"use client";

import { useEffect, useState } from "react";
import {
  getOfflineQueue,
  isOnline,
  processOfflineQueue,
} from "../lib/offlineSyncQueue";

export default function PWARegister() {
  const [showInstallHelp, setShowInstallHelp] =
    useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => {
          console.error(
            "Service worker registration failed:",
            error
          );
        });
    }

    const runSync = async () => {
      if (!isOnline()) return;

      const queue = getOfflineQueue();

      if (queue.length === 0) return;

      await processOfflineQueue();
    };

    const handleOnline = () => {
      runSync();
    };

    const handleVisibility = () => {
      if (
        document.visibilityState === "visible"
      ) {
        runSync();
      }
    };

    window.addEventListener(
      "online",
      handleOnline
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    const interval = window.setInterval(
      runSync,
      30000
    );

    const isStandalone =
      window.matchMedia(
        "(display-mode: standalone)"
      ).matches ||
      (window.navigator as any).standalone ===
        true;

    const isMobile =
      /iphone|ipad|ipod|android/i.test(
        window.navigator.userAgent
      );

    if (isMobile && !isStandalone) {
      const dismissed =
        window.localStorage.getItem(
          "on_point_pwa_install_dismissed"
        );

      if (!dismissed) {
        setShowInstallHelp(true);
      }
    }

    runSync();

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );

      window.clearInterval(interval);
    };
  }, []);

  if (!showInstallHelp) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] rounded-2xl border border-teal-500 bg-[#071224] p-4 text-[var(--fl-text)] shadow-2xl md:left-auto md:max-w-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
            Install App
          </p>

          <h3 className="mt-1 text-lg font-extrabold">
            Add FLOW to your home screen
          </h3>

          <p className="mt-2 text-sm text-[var(--fl-muted)]">
            On iPhone, tap Share, then Add to Home Screen.
            On Android, use Install App or Add to Home Screen.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(
              "on_point_pwa_install_dismissed",
              "true"
            );

            setShowInstallHelp(false);
          }}
          className="rounded-xl border border-[var(--fl-line)] px-3 py-1 text-sm font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
        >
          Hide
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

/**
 * Registers the unified service worker (/sw.js) for every user on mount,
 * independent of push-notification permission. The unified worker provides
 * offline caching AND (via importScripts of /push-sw.js) push handling.
 *
 * Renders nothing. Registration errors are logged and swallowed.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}

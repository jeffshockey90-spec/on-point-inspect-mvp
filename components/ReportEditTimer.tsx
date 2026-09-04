"use client";

import { useEffect, useRef } from "react";

// Silently measures ACTIVE time spent editing a report in the builder — the
// write-up phase (editing findings + section checklists). Counts only while the
// tab is visible AND focused, so it excludes overnight gaps, background tabs, and
// the physical inspection. Flushes accumulated seconds to the server
// periodically and on hide/unload. Renders nothing.
export default function ReportEditTimer({ inspectionId }: { inspectionId: string }) {
  const pendingRef = useRef(0);

  useEffect(() => {
    if (!inspectionId) return;
    const TICK = 5; // seconds per tick
    const FLUSH_AT = 30; // flush after this many accumulated active seconds

    const isActive = () =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus();

    function flush(useBeacon = false) {
      const secs = Math.round(pendingRef.current);
      if (secs < 1) return;
      pendingRef.current = 0;
      const payload = JSON.stringify({ inspectionId, seconds: secs });
      try {
        if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/inspections/edit-time",
            new Blob([payload], { type: "application/json" }),
          );
        } else {
          void fetch("/api/inspections/edit-time", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
    }

    const interval = window.setInterval(() => {
      if (isActive()) {
        pendingRef.current += TICK;
        if (pendingRef.current >= FLUSH_AT) flush();
      }
    }, TICK * 1000);

    function onVisibility() {
      if (document.visibilityState === "hidden") flush(true);
    }
    function onPageHide() {
      flush(true);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flush(true);
    };
  }, [inspectionId]);

  return null;
}

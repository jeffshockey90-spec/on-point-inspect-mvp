"use client";

import { useEffect, useRef } from "react";

export default function ReportTimeTracker({
  inspectionId,
  viewerRole,
  viewerEmail,
  path,
}: {
  inspectionId: string;
  viewerRole?: string | null;
  viewerEmail?: string | null;
  path?: string | null;
}) {
  const startTimeRef = useRef<number>(Date.now());
  const lastSentAtRef = useRef<number>(Date.now());
  const sentFinalRef = useRef(false);

  useEffect(() => {
    function getElapsedSeconds() {
      return Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));
    }

    function sendDuration({ final = false }: { final?: boolean } = {}) {
      const durationSeconds = getElapsedSeconds();

      if (durationSeconds < 5) return;

      const now = Date.now();

      if (!final && now - lastSentAtRef.current < 30000) return;
      if (final && sentFinalRef.current) return;

      if (final) sentFinalRef.current = true;
      lastSentAtRef.current = now;

      const payload = {
        inspection_id: inspectionId,
        view_type: final ? "report_time_final" : "report_time_checkpoint",
        viewer_role: viewerRole || null,
        viewer_email: viewerEmail || null,
        path: path || window.location.pathname,
        duration_seconds: durationSeconds,
      };

      const body = JSON.stringify(payload);

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/track-report-duration", blob);
        return;
      }

      fetch("/api/track-report-duration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    const interval = window.setInterval(() => {
      sendDuration();
    }, 30000);

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        sendDuration({ final: true });
      }
    }

    function handlePageHide() {
      sendDuration({ final: true });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      sendDuration({ final: true });
    };
  }, [inspectionId, viewerRole, viewerEmail, path]);

  return null;
}

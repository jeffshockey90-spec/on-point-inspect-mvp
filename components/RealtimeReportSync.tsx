"use client";

// Live cross-device sync for an open report: subscribes to findings changes for
// this inspection and gently refreshes the page when another device adds/edits/
// removes a finding. Read-only and passive (a websocket, no polling) — it never
// touches the capture/save path and adds no latency to normal use. Refreshes
// are debounced, scroll-preserving, and bail the instant you scroll yourself.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { refreshKeepScroll } from "../lib/refreshKeepScroll";

export default function RealtimeReportSync({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!inspectionId) return;

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Only refresh a visible tab — don't churn one sitting in the background.
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          refreshKeepScroll(router);
        }
      }, 800);
    };

    const channel = supabase
      .channel(`report-findings-${inspectionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "findings", filter: `inspection_id=eq.${inspectionId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [inspectionId, router]);

  return null;
}

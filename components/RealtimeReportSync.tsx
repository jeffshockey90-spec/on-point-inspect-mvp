"use client";

// Live cross-device sync for an open report: subscribes to FINDINGS changes for
// this inspection and gently refreshes the page when another device adds/edits/
// removes a finding. This is the ONE sync component for the builder — it replaced
// a second component that did a hard window.location.reload() on the same events.
// It deliberately does NOT watch the inspections row: the report-edit timer
// writes active-editing seconds onto that row every ~30s, and refreshing on that
// mid-scroll caused the "glitches when scrolling" bug. Read-only and passive (a
// websocket, no polling) — it never touches the capture/save path and adds no
// latency to normal use. Refreshes are debounced, scroll-preserving, suppress
// this device's own edit echoes, and bail the instant you scroll yourself.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { refreshKeepScroll } from "../lib/refreshKeepScroll";
import { wasRecentLocalEdit } from "../lib/localEditSignal";

export default function RealtimeReportSync({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!inspectionId) return;

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Ignore the database echo of an edit THIS device just made — it's already
        // on screen. A change from another device (no recent local edit here)
        // still refreshes, so cross-device sync is unchanged.
        if (wasRecentLocalEdit()) return;
        // Only refresh a visible tab — don't churn one sitting in the background.
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          refreshKeepScroll(router, { skipMark: true });
        }
      }, 800);
    };

    // ONLY findings. Do NOT watch the inspections table here: the report-edit
    // timer flushes active-editing seconds onto the inspection row every ~30s,
    // and watching inspections turned each of those into a full builder refresh
    // + scroll-restore WHILE the inspector was actively scrolling/editing — the
    // "glitches when scrolling" bug. Cross-device finding sync (the important
    // one) is fully covered by the findings watch.
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

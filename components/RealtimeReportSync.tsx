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
    // ---- Section-level live sync (checklist, limitations, reference photos,
    // equipment). Instead of a full builder refresh, tell ONLY the affected
    // part to quietly reload itself. Updates are held while this device is
    // being touched/typed on (so our own saves don't bounce back and nothing
    // being typed is overwritten), then applied ~1s after the inspector stops
    // — deferred, never dropped. Needs supabase/realtime-section-sync.sql.
    type Kind = "checklist" | "limitations" | "refphotos" | "equipment";
    const pending = new Map<string, { kind: Kind; section: string }>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastInteraction = 0;
    const markInteraction = () => {
      lastInteraction = Date.now();
    };
    window.addEventListener("pointerdown", markInteraction, true);
    window.addEventListener("keydown", markInteraction, true);
    // Equipment is saved by server form actions that already refresh this page
    // in place; skip the database echo of THIS device's own submit.
    let lastSubmitAt = 0;
    const markSubmit = () => {
      lastSubmitAt = Date.now();
    };
    window.addEventListener("submit", markSubmit, true);

    const isTyping = () => {
      const el = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const flush = () => {
      flushTimer = null;
      if (pending.size === 0) return;
      const busy =
        isTyping() ||
        Date.now() - lastInteraction < 1500 ||
        wasRecentLocalEdit() ||
        (typeof document !== "undefined" && document.visibilityState !== "visible");
      if (busy) {
        flushTimer = setTimeout(flush, 1200);
        return;
      }
      const items = Array.from(pending.values());
      pending.clear();
      let equipment = false;
      for (const { kind, section } of items) {
        if (kind === "checklist") {
          window.dispatchEvent(
            new CustomEvent("opi:checklist-updated", {
              detail: { inspectionId, ...(section ? { sections: [section] } : {}) },
            }),
          );
        } else if (kind === "limitations") {
          window.dispatchEvent(
            new CustomEvent("opi:section-limitations-changed", {
              detail: { inspectionId, section, quiet: true },
            }),
          );
        } else if (kind === "refphotos") {
          window.dispatchEvent(
            new CustomEvent("opi:reference-photos-changed", { detail: { inspectionId, section } }),
          );
        } else if (Date.now() - lastSubmitAt > 10000) {
          equipment = true;
        }
      }
      // Equipment cards are server-rendered: refresh the page in place.
      if (equipment) refreshKeepScroll(router, { skipMark: true });
    };

    const queue = (kind: Kind) => (payload: any) => {
      const row = payload?.new && Object.keys(payload.new).length ? payload.new : payload?.old || {};
      const section = kind === "equipment" ? "" : String(row?.section || "");
      pending.set(`${kind}|${section}`, { kind, section });
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 800);
    };

    const filter = `inspection_id=eq.${inspectionId}`;
    const channel = supabase
      .channel(`report-findings-${inspectionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "findings", filter },
        scheduleRefresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "section_checklist_selections", filter }, queue("checklist"))
      .on("postgres_changes", { event: "*", schema: "public", table: "section_limitations", filter }, queue("limitations"))
      .on("postgres_changes", { event: "*", schema: "public", table: "section_reference_photos", filter }, queue("refphotos"))
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_inventory", filter }, queue("equipment"))
      .subscribe();
    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      window.removeEventListener("pointerdown", markInteraction, true);
      window.removeEventListener("keydown", markInteraction, true);
      window.removeEventListener("submit", markSubmit, true);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [inspectionId, router]);

  return null;
}

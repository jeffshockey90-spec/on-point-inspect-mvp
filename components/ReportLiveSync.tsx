"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../utils/supabase/client";

// Live cross-device sync for the report editor. When a report's findings or
// report-level fields change (from another device), a device that is just
// VIEWING reloads to the latest automatically — the fix for "I had to exit and
// come back on my phone". The device that is actively editing is never
// auto-reloaded (that would clobber an in-progress edit); it gets a small
// "Load latest" banner instead.
export default function ReportLiveSync({
  inspectionId,
}: {
  inspectionId: string | number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pending, setPending] = useState(false);
  const lastActivityRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = String(inspectionId || "");
    if (!id) return;

    // Any typing/tapping inside the page marks this device as "editing" for a
    // short window, so its own saves don't trigger an auto-reload on itself.
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    document.addEventListener("input", markActive, true);
    document.addEventListener("keydown", markActive, true);
    document.addEventListener("pointerdown", markActive, true);

    const isActivelyEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      return typing || Date.now() - lastActivityRef.current < 12000;
    };

    const handleRemoteChange = () => {
      if (isActivelyEditing()) {
        setPending(true); // don't clobber an in-progress edit
        return;
      }
      // Passive viewer — reload to the latest. Debounced so a burst of changes
      // from the other device coalesces into a single reload.
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        window.location.reload();
      }, 1200);
    };

    const channel = supabase
      .channel(`report-sync-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "findings",
          filter: `inspection_id=eq.${id}`,
        },
        handleRemoteChange,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "inspections",
          filter: `id=eq.${id}`,
        },
        handleRemoteChange,
      )
      .subscribe();

    return () => {
      document.removeEventListener("input", markActive, true);
      document.removeEventListener("keydown", markActive, true);
      document.removeEventListener("pointerdown", markActive, true);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [inspectionId, supabase]);

  if (!pending) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100vw-2.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-teal-500/50 bg-[#020617] p-4 text-white shadow-2xl shadow-black/40">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-xl">
          🔄
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">
            This report was updated on another device.
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Load the latest so you don’t overwrite it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-teal-500 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-teal-400"
        >
          Load latest
        </button>
        <button
          type="button"
          onClick={() => setPending(false)}
          className="shrink-0 rounded-lg border border-slate-700 px-2 py-2 text-xs font-black text-slate-300 transition hover:border-red-400 hover:text-red-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

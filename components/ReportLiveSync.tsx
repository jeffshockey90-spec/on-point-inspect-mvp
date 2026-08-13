"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "../utils/supabase/client";

// Live cross-device sync for the report editor. When a report's findings or
// report-level fields change, a device that is only VIEWING reloads to the
// latest automatically — the fix for "I had to exit and come back on my phone".
//
// The device that is actively editing is NEVER disrupted: realtime can't tell
// this device's own saves from another device's, so while you're interacting
// with the page (recent typing/tapping) we ignore change events entirely — no
// reload, no banner. Only an idle (passive) device reloads.
export default function ReportLiveSync({
  inspectionId,
}: {
  inspectionId: string | number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const lastActivityRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = String(inspectionId || "");
    if (!id) return;

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
      // Treat the device as "editing" for a short window after any interaction,
      // so its own saves never reload/interrupt it.
      return typing || Date.now() - lastActivityRef.current < 15000;
    };

    const handleRemoteChange = () => {
      if (isActivelyEditing()) return; // never disturb the editing device
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        // Re-check right before reloading in case the user just started editing.
        if (isActivelyEditing()) return;
        window.location.reload();
      }, 1500);
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

  return null;
}

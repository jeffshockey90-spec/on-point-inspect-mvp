"use client";

import { useEffect, useRef } from "react";
import { saveInspectionPreload } from "../lib/offlineInspectionPreload";

type Props = {
  inspectionId: string;
  inspection: any;
  groupedFindings: any[];
  sections: string[];
  clientInfo?: Record<string, any>;
};

export default function OfflineReportCacheBridge({
  inspectionId,
  inspection,
  groupedFindings,
  sections,
  clientInfo = {},
}: Props) {
  // page.tsx is a server component, so `inspection`/`groupedFindings`/`sections`
  // are brand-new object/array identities on EVERY render. Without a guard this
  // effect re-ran on every refresh and did a synchronous JSON.stringify of up to
  // 500 findings + localStorage.setItem on the main thread — a per-refresh stall
  // that amplified the edit flicker. Only re-write when the data actually
  // changed, and defer it off the refresh's critical path.
  const lastSigRef = useRef("");

  useEffect(() => {
    if (!inspectionId) return;

    const flatFindings = (groupedFindings || []).flatMap((group: any) =>
      (group.findings || []).map((finding: any) => ({
        ...finding,
        section: finding.section || group.section,
      })),
    );

    // Cheap change signature — never serializes the full finding objects.
    const sig = [
      inspectionId,
      flatFindings.length,
      flatFindings.map((f: any) => `${f.id}:${f.updated_at || ""}`).join(","),
      (sections || []).join(","),
      inspection?.updated_at || "",
      inspection?.report_status || inspection?.status || "",
      inspection?.published ? "1" : "0",
    ].join("|");

    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    const write = () =>
      saveInspectionPreload({
        inspectionId,
        inspection,
        reports: inspection ? [inspection] : [],
        comments: [],
        templates: [],
        sections,
        findings: flatFindings,
        groupedFindings,
        clientInfo: {
          ...(clientInfo || {}),
          ...(inspection || {}),
        },
        reportSnapshot: {
          inspection,
          groupedFindings,
          sections,
          cachedFrom: "report-page",
        },
      });

    // Defer the heavy write so it never blocks the refresh's render/paint.
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;
    if (idle) {
      const handle = idle(write, { timeout: 1500 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    const t = window.setTimeout(write, 0);
    return () => window.clearTimeout(t);
  }, [inspectionId, inspection, groupedFindings, sections, clientInfo]);

  return null;
}

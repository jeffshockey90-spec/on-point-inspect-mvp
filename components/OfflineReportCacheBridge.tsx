"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    if (!inspectionId) return;

    saveInspectionPreload({
      inspectionId,
      inspection,
      reports: inspection ? [inspection] : [],
      comments: [],
      templates: [],
      sections,
      findings: (groupedFindings || []).flatMap((group: any) =>
        (group.findings || []).map((finding: any) => ({
          ...finding,
          section: finding.section || group.section,
        })),
      ),
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
  }, [inspectionId, inspection, groupedFindings, sections, clientInfo]);

  return null;
}

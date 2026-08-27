"use client";


import { formatAppValue } from "../lib/app-time";
import { useEffect, useMemo, useState } from "react";
import {
  getCachedInspectionPreload,
  getInspectionLabel,
} from "../lib/offlineInspectionPreload";

function getSeverityStyle(severity: any) {
  const clean = String(severity || "Recommended Repair").toLowerCase();

  if (clean.includes("safety") || clean.includes("major") || clean.includes("hazard")) {
    return "border-red-500/60 bg-red-500/10 text-red-200";
  }

  if (clean.includes("monitor") || clean.includes("maintenance")) {
    return "border-yellow-500/60 bg-yellow-500/10 text-yellow-100";
  }

  if (clean.includes("info")) {
    return "border-blue-500/60 bg-blue-500/10 text-blue-200";
  }

  return "border-teal-500/60 bg-teal-500/10 text-[var(--fl-accent-text)]";
}

function getPhotoUrl(photo: any) {
  return (
    photo?.signed_thumbnail_url ||
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    photo?.url ||
    ""
  );
}

function isVideo(photo: any) {
  const type = String(photo?.mime_type || photo?.media_type || "").toLowerCase();
  const url = String(getPhotoUrl(photo) || "").toLowerCase();
  return Boolean(photo?.is_video) || type.startsWith("video/") || /\.(mp4|mov|m4v|webm)(\?|$)/.test(url);
}

export default function OfflineReportViewer({
  inspectionId,
  onClose,
}: {
  inspectionId: string;
  onClose?: () => void;
}) {
  const [cache, setCache] = useState<any>(null);

  useEffect(() => {
    setCache(getCachedInspectionPreload(inspectionId));

    function handleCacheUpdate() {
      setCache(getCachedInspectionPreload(inspectionId));
    }

    window.addEventListener("opi:inspection-preload-updated", handleCacheUpdate);
    window.addEventListener("on-point-offline-queue-change", handleCacheUpdate);

    return () => {
      window.removeEventListener("opi:inspection-preload-updated", handleCacheUpdate);
      window.removeEventListener("on-point-offline-queue-change", handleCacheUpdate);
    };
  }, [inspectionId]);

  const groupedFindings = useMemo(() => {
    const grouped = cache?.groupedFindings || cache?.reportSnapshot?.groupedFindings;
    if (Array.isArray(grouped) && grouped.length > 0) return grouped;

    const sections = Array.isArray(cache?.sections) ? cache.sections : [];
    const findings = Array.isArray(cache?.findings) ? cache.findings : [];

    if (sections.length > 0) {
      return sections.map((section: string) => ({
        section,
        findings: findings.filter((finding: any) => String(finding.section || "Inspection Details") === section),
      }));
    }

    const sectionMap = new Map<string, any[]>();
    findings.forEach((finding: any) => {
      const section = String(finding.section || "Inspection Details");
      sectionMap.set(section, [...(sectionMap.get(section) || []), finding]);
    });

    return Array.from(sectionMap.entries()).map(([section, nextFindings]) => ({
      section,
      findings: nextFindings,
    }));
  }, [cache]);

  if (!cache) {
    return (
      <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-5 text-red-100">
        <h2 className="text-xl font-semibold">Offline report is not cached yet</h2>
        <p className="mt-2 text-sm leading-6">
          Open this report once while online before the inspection, then the Field Tool can show the cached report with no signal.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-100"
          >
            Back to Field Tool
          </button>
        )}
      </div>
    );
  }

  const label = cache?.inspection?.label || getInspectionLabel(cache?.inspection?.raw || cache?.clientInfo || {});
  const cachedAt = cache?.cachedAt ? formatAppValue(new Date(cache.cachedAt), {}) : "Unknown";

  return (
    <div className="space-y-4 rounded-2xl border border-cyan-500/40 bg-[#071224] p-4 text-[var(--fl-text)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Offline Report Viewer
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{label || `Inspection ${inspectionId}`}</h1>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            Read-only cached report. Cached: {cachedAt}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-teal-500 px-4 py-2 font-semibold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500 hover:text-black"
          >
            Back to Field Tool
          </button>
        )}
      </div>

      <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm font-bold text-yellow-100">
        Offline mode is read-only. Add new notes/photos in the Field Tool. They will sync to the live report when service returns.
      </div>

      {groupedFindings.length === 0 && (
        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-muted)]">
          No cached findings yet. Open the live report while online to preload the current findings.
        </div>
      )}

      {groupedFindings.map((group: any) => {
        const findings = group.findings || [];
        return (
          <section key={group.section} className="overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)]">
            <div className="border-b border-[var(--fl-line)] px-4 py-3">
              <h2 className="text-xl font-semibold text-[var(--fl-accent-text)]">{group.section}</h2>
              <p className="text-xs font-bold text-[var(--fl-muted)]">
                {findings.length} finding{findings.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="space-y-3 p-3">
              {findings.length === 0 && (
                <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-muted)]">
                  No cached findings in this section.
                </p>
              )}

              {findings.map((finding: any) => {
                const photos = Array.isArray(finding.photos) ? finding.photos : [];
                const firstPhoto = photos[0];
                const photoUrl = firstPhoto ? getPhotoUrl(firstPhoto) : "";

                return (
                  <article key={finding.id || `${group.section}-${finding.title}`} className="rounded-xl border border-[var(--fl-line)] bg-[#071224] p-3">
                    <div className="flex gap-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--fl-line)] bg-black">
                        {photoUrl ? (
                          isVideo(firstPhoto) ? (
                            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-cyan-300">
                              ▶ Video
                            </div>
                          ) : (
                            <img src={photoUrl} alt="Finding" className="h-full w-full object-cover" />
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-[var(--fl-faint)]">
                            No Photo
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${getSeverityStyle(finding.severity)}`}>
                            {finding.severity || "Recommended Repair"}
                          </span>
                          {photos.length > 0 && (
                            <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase text-cyan-200">
                              {photos.length} media
                            </span>
                          )}
                        </div>

                        <h3 className="break-words text-base font-semibold text-[var(--fl-text)]">
                          {finding.title || finding.finding_title || finding.defect_title || "Untitled Finding"}
                        </h3>

                        {finding.observation && (
                          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">{finding.observation}</p>
                        )}
                        {finding.implication && (
                          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]"><b>Implication:</b> {finding.implication}</p>
                        )}
                        {finding.recommendation && (
                          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]"><b>Recommendation:</b> {finding.recommendation}</p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

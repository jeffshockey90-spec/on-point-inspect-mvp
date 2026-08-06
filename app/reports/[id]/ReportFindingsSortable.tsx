"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import SectionLimitations from "../../../components/SectionLimitations";
import SectionNotesEditor from "../../../components/SectionNotesEditor";
import PhotoCaptionField from "../../../components/PhotoCaptionField";
import ReportDisclaimers from "../../../components/ReportDisclaimers";
import SectionInformationChecklist from "../../../components/SectionInformationChecklist";
import SectionReferencePhotos from "../../../components/SectionReferencePhotos";
import AISectionReview from "../../../components/AISectionReview";
import ExpandableReportImage from "../../../components/ExpandableReportImage";
import { supabase } from "../../../lib/supabaseClient";

const PHOTO_BUCKET = "inspection-photos";

const SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

const AUTO_PREVIEW_PHOTO_LIMIT = 1;

function commandSlug(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFindingAnchor(finding: any) {
  return `finding-${String(finding?.id || "").trim()}`;
}

function getReviewedFindingStorageKey() {
  return "opi-command-center-reviewed-findings";
}

function markFindingReviewedForCommandCenter(findingId: any) {
  if (typeof window === "undefined") return;

  const id = String(findingId || "").trim();
  if (!id) return;

  try {
    const raw = window.localStorage.getItem(getReviewedFindingStorageKey());
    const values = raw ? JSON.parse(raw) : [];
    const ids = new Set(
      (Array.isArray(values) ? values : []).map((value) => String(value)),
    );
    ids.add(id);
    window.localStorage.setItem(
      getReviewedFindingStorageKey(),
      JSON.stringify(Array.from(ids)),
    );
  } catch {}

  // Keep the Command Center counts live without requiring a refresh.
  window.dispatchEvent(
    new CustomEvent("opi:finding-reviewed", { detail: { findingId: id } }),
  );
  window.dispatchEvent(new Event("opi:reviewed-findings-changed"));
}

const EditableFinding = dynamic(
  () => import("../../../components/EditableFinding"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm font-bold text-slate-400">
        Loading editor...
      </div>
    ),
  },
);

const PhotoMarkupEditor = dynamic(
  () => import("../../../components/PhotoMarkupEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-purple-700 bg-purple-950/20 p-4 text-sm font-bold text-purple-200">
        Loading photo markup...
      </div>
    ),
  },
);

const PHOTO_PICKER_PAGE_SIZE = 48;

function DeferredOpenSection({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hasRendered, setHasRendered] = useState(false);

  useEffect(() => {
    if (!active || hasRendered) return;

    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setHasRendered(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasRendered(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: "1400px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(host);

    return () => observer.disconnect();
  }, [active, hasRendered]);

  return (
    <div ref={hostRef} className="w-full max-w-full">
      {active && hasRendered ? children : null}
    </div>
  );
}

export default function ReportFindingsSortable({ groupedFindings, deletedSections, sectionNotes, weatherContext }: any) {
  const params = useParams();
  const router = useRouter();
  const inspectionId = String(params?.id || "");

  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [savingSection, setSavingSection] = useState(false);
  const [deletingSection, setDeletingSection] = useState<string | null>(null);
  const [restoringSection, setRestoringSection] = useState<string | null>(null);
  const [sectionMessage, setSectionMessage] = useState("");
  const [deletedSectionsOpen, setDeletedSectionsOpen] = useState(false);

  async function callReportSectionsApi(action: "create" | "delete" | "restore", sectionName: string) {
    const res = await fetch("/api/report-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId, sectionName, action }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Failed to ${action} section.`);
    }

    return data;
  }

  async function addCustomSection() {
    const cleanName = newSectionName.trim();

    if (!cleanName) {
      setSectionMessage("Enter a section name.");
      return;
    }

    setSavingSection(true);
    setSectionMessage("");

    try {
      await callReportSectionsApi("create", cleanName);
      setNewSectionName("");
      setAddSectionOpen(false);
      router.refresh();
    } catch (error: any) {
      setSectionMessage(error?.message || "Failed to add section.");
    } finally {
      setSavingSection(false);
    }
  }

  async function deleteSection(sectionName: string, findingCount: number) {
    if (deletingSection) return;

    const warning =
      findingCount > 0
        ? `Delete "${sectionName}"? Its ${findingCount} finding${findingCount === 1 ? "" : "s"} will be hidden from the report until you restore this section.`
        : `Delete "${sectionName}"?`;

    if (!window.confirm(warning)) return;

    setDeletingSection(sectionName);
    setSectionMessage("");

    try {
      await callReportSectionsApi("delete", sectionName);
      router.refresh();
    } catch (error: any) {
      setSectionMessage(error?.message || "Failed to delete section.");
    } finally {
      setDeletingSection(null);
    }
  }

  async function restoreSection(sectionName: string) {
    if (restoringSection) return;

    setRestoringSection(sectionName);
    setSectionMessage("");

    try {
      await callReportSectionsApi("restore", sectionName);
      router.refresh();
    } catch (error: any) {
      setSectionMessage(error?.message || "Failed to restore section.");
    } finally {
      setRestoringSection(null);
    }
  }

  function getAllSectionsClosed(groups: any[]) {
    const next: Record<string, boolean> = {};

    (groups || []).forEach((group: any) => {
      next[group.section] = true;
    });

    return next;
  }

  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(
    () => getAllSectionsClosed(groupedFindings || []),
  );

  const [orderedGroups, setOrderedGroups] = useState<any[]>(
    groupedFindings || [],
  );
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const [photoPickerLoaded, setPhotoPickerLoaded] = useState(false);

  useEffect(() => {
    const nextGroups = groupedFindings || [];

    setOrderedGroups(nextGroups);
    setClosedSections(getAllSectionsClosed(nextGroups));
  }, [groupedFindings]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("touch-action");
    document.documentElement.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("touch-action");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncCompleteKey = "opi-offline-sync-complete-at";
    const seenKey = `opi-offline-sync-seen-${inspectionId}`;

    function refreshReportAfterOfflineSync() {
      const syncedAt = window.localStorage.getItem(syncCompleteKey) || "";
      const lastSeen = window.sessionStorage.getItem(seenKey) || "";

      if (syncedAt && syncedAt !== lastSeen) {
        window.sessionStorage.setItem(seenKey, syncedAt);
        router.refresh();
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === syncCompleteKey) {
        refreshReportAfterOfflineSync();
      }
    }

    window.addEventListener(
      "opi:offline-sync-complete",
      refreshReportAfterOfflineSync,
    );
    window.addEventListener("storage", handleStorage);

    refreshReportAfterOfflineSync();

    return () => {
      window.removeEventListener(
        "opi:offline-sync-complete",
        refreshReportAfterOfflineSync,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [inspectionId, router]);


  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleLiveLimitationAdded(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const eventInspectionId = String(detail.inspectionId || "");
      const targetSection = String(detail.section || "");

      if (!targetSection) return;
      if (eventInspectionId && eventInspectionId !== String(inspectionId)) return;

      setClosedSections((current) => ({
        ...current,
        [targetSection]: false,
      }));

      router.refresh();

      window.setTimeout(() => {
        document
          .getElementById(`report-section-${commandSlug(targetSection)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    }

    window.addEventListener(
      "opi:section-limitations-changed",
      handleLiveLimitationAdded as EventListener,
    );

    return () => {
      window.removeEventListener(
        "opi:section-limitations-changed",
        handleLiveLimitationAdded as EventListener,
      );
    };
  }, [inspectionId, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleLiveFindingAdded(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const eventInspectionId = String(detail.inspectionId || "");
      const targetSection = String(detail.section || "");

      if (eventInspectionId && eventInspectionId !== String(inspectionId)) {
        return;
      }

      if (targetSection) {
        setClosedSections((current) => ({
          ...current,
          [targetSection]: false,
        }));
      }

      router.refresh();

      window.setTimeout(() => {
        if (targetSection) {
          document
            .getElementById(`report-section-${commandSlug(targetSection)}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 350);
    }

    window.addEventListener(
      "opi:findings-changed",
      handleLiveFindingAdded as EventListener,
    );

    return () => {
      window.removeEventListener(
        "opi:findings-changed",
        handleLiveFindingAdded as EventListener,
      );
    };
  }, [inspectionId, router]);

  const allFindings = useMemo(() => {
    return (orderedGroups || []).flatMap((group: any) => group.findings || []);
  }, [orderedGroups]);

  const allPhotos = useMemo(() => {
    if (!photoPickerLoaded) return [];

    const seen = new Set<string>();
    const photos: any[] = [];

    (allFindings || []).forEach((finding: any) => {
      (finding.photos || []).forEach((photo: any) => {
        const key = String(
          photo.id ||
            photo.file_path ||
            photo.public_url ||
            photo.signed_url ||
            "",
        );
        if (!key || seen.has(key)) return;

        seen.add(key);
        photos.push({
          ...photo,
          current_finding_id: photo.finding_id || finding.id,
          current_finding_title:
            finding.title ||
            finding.finding_title ||
            finding.defect_title ||
            finding.name ||
            "Untitled Finding",
          current_section: finding.section || "Inspection Details",
        });
      });
    });

    return photos;
  }, [allFindings, photoPickerLoaded]);

  useEffect(() => {
    function openTargetFromHash(rawTarget?: string) {
      const target = String(rawTarget || window.location.hash || "")
        .replace(/^#/, "")
        .trim();
      if (!target) return;

      let targetFindingId = "";
      if (target.startsWith("finding-"))
        targetFindingId = target.replace("finding-", "");

      if (targetFindingId) {
        const matchedGroup = (orderedGroups || []).find((group: any) =>
          (group.findings || []).some(
            (finding: any) => String(finding.id) === targetFindingId,
          ),
        );

        if (matchedGroup?.section) {
          setClosedSections((prev) => ({
            ...prev,
            [matchedGroup.section]: false,
          }));
        }
      } else if (target.startsWith("report-section-")) {
        const sectionSlug = target.replace("report-section-", "");
        const matchedGroup = (orderedGroups || []).find(
          (group: any) => commandSlug(group.section) === sectionSlug,
        );
        if (matchedGroup?.section) {
          setClosedSections((prev) => ({
            ...prev,
            [matchedGroup.section]: false,
          }));
        }
      }

      window.setTimeout(() => {
        const element = document.getElementById(target);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add(
            "ring-4",
            "ring-cyan-300",
            "ring-offset-4",
            "ring-offset-slate-950",
          );
          window.setTimeout(() => {
            element.classList.remove(
              "ring-4",
              "ring-cyan-300",
              "ring-offset-4",
              "ring-offset-slate-950",
            );
          }, 2200);
        }
      }, 180);
    }

    function handleHashChange() {
      openTargetFromHash();
    }

    function handleCommandJump(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const firstFindingId = Array.isArray(detail.findingIds)
        ? detail.findingIds[0]
        : "";
      openTargetFromHash(
        detail.targetAnchor ||
          (firstFindingId ? `finding-${firstFindingId}` : ""),
      );
    }

    // Do not react to existing URL hashes on page load.
    // Command Center jumps should only happen after an explicit user click.
    window.addEventListener(
      "opi:command-center-jump",
      handleCommandJump as EventListener,
    );

    return () => {
      window.removeEventListener(
        "opi:command-center-jump",
        handleCommandJump as EventListener,
      );
    };
  }, [orderedGroups]);

  function toggleSection(section: string) {
    setClosedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  function expandAll() {
    setClosedSections({});
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};

    (orderedGroups || []).forEach((group: any) => {
      next[group.section] = true;
    });

    setClosedSections(next);
  }

  // Persist the reordered section list so it survives refresh/publish and shows
  // in the same order on the client share page, print/PDF, and realtor download.
  // Fire-and-forget: the local UI already reflects the new order.
  async function persistSectionOrder(sections: string[]) {
    if (!inspectionId) return;
    try {
      await fetch("/api/report-section-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, order: sections }),
      });
    } catch {}
  }

  function moveSection(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= orderedGroups.length) return;

    const next = [...orderedGroups];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrderedGroups(next);
    persistSectionOrder(next.map((group: any) => group.section));
  }

  function handleDragStart(section: string) {
    setDraggingSection(section);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  function handleDrop(targetSection: string) {
    if (!draggingSection || draggingSection === targetSection) {
      setDraggingSection(null);
      return;
    }

    const next = [...orderedGroups];

    const fromIndex = next.findIndex(
      (group: any) => group.section === draggingSection,
    );

    const toIndex = next.findIndex(
      (group: any) => group.section === targetSection,
    );

    if (fromIndex !== -1 && toIndex !== -1) {
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setOrderedGroups(next);
      persistSectionOrder(next.map((group: any) => group.section));
    }

    setDraggingSection(null);
  }

  // All section names currently on this inspection (built-in + custom), so a
  // finding can be moved into a custom section, not just the 12 built-ins.
  const availableSections = (orderedGroups || [])
    .map((group: any) => group.section)
    .filter((section: string) => section && section !== "Other");

  return (
    <div
      id="report-findings-editor"
      data-command-target="report-findings"
      className="w-full max-w-full space-y-4 overflow-visible"
    >
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-700 bg-[#0f172a] p-3 sm:flex-row sm:flex-wrap sm:p-4">
        <button
          type="button"
          onClick={expandAll}
          className="w-full rounded-xl bg-teal-500 px-4 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 sm:w-auto sm:py-2"
        >
          Expand All
        </button>

        <button
          type="button"
          onClick={collapseAll}
          className="w-full rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-slate-200 transition active:scale-[0.98] hover:bg-slate-800 sm:w-auto sm:py-2"
        >
          Collapse All
        </button>

        <div className="w-full rounded-xl border border-slate-700 px-4 py-2 text-center text-xs font-bold text-slate-400 sm:w-auto sm:text-left sm:text-sm">
          <span className="sm:hidden">Use arrows to reorder</span>
          <span className="hidden sm:inline">
            Drag section headers to reorder
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setAddSectionOpen((value) => !value);
            setSectionMessage("");
          }}
          className="w-full rounded-xl border border-cyan-500 px-4 py-3 text-sm font-black text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500/10 sm:w-auto sm:py-2"
        >
          + Add Section
        </button>

        {deletedSections && deletedSections.length > 0 && (
          <button
            type="button"
            onClick={() => setDeletedSectionsOpen((value) => !value)}
            className="w-full rounded-xl border border-orange-500/60 px-4 py-3 text-sm font-black text-orange-300 transition active:scale-[0.98] hover:bg-orange-500/10 sm:w-auto sm:py-2"
          >
            {deletedSectionsOpen ? "Hide" : "Show"} Deleted Sections ({deletedSections.length})
          </button>
        )}
      </div>

      {addSectionOpen && (
        <div className="w-full rounded-2xl border border-cyan-500/40 bg-[#0f172a] p-4">
          <p className="mb-3 text-sm font-bold text-slate-300">
            Add a custom section (e.g. Pool, Guest House, Outbuilding).
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newSectionName}
              onChange={(event) => setNewSectionName(event.target.value)}
              disabled={savingSection}
              placeholder="Section name"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addCustomSection();
                }
              }}
            />

            <button
              type="button"
              onClick={addCustomSection}
              disabled={savingSection}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSection ? "Adding..." : "Add Section"}
            </button>
          </div>
        </div>
      )}

      {sectionMessage && (
        <div className="w-full rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">
          {sectionMessage}
        </div>
      )}

      {deletedSectionsOpen && deletedSections && deletedSections.length > 0 && (
        <div className="w-full space-y-2 rounded-2xl border border-orange-500/40 bg-[#0f172a] p-4">
          <p className="mb-1 text-sm font-bold text-slate-300">
            Deleted sections - restoring brings the section and any findings still tagged with it back into the report.
          </p>

          {deletedSections.map((row: any) => (
            <div
              key={row.id || row.section_name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#020617] px-4 py-3"
            >
              <span className="font-bold text-slate-200">{row.section_name}</span>

              <button
                type="button"
                onClick={() => restoreSection(row.section_name)}
                disabled={restoringSection === row.section_name}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-teal-500 px-4 py-2 text-xs font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {restoringSection === row.section_name ? "Restoring..." : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}

      {(orderedGroups || []).map((group: any, index: number) => {
        const findings = group.findings || [];
        const isClosed = !!closedSections[group.section];
        const isDragging = draggingSection === group.section;

        return (
          <section
            key={group.section}
            id={`report-section-${commandSlug(group.section)}`}
            data-command-target={`report-section-${commandSlug(group.section)}`}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(group.section)}
            className={`w-full max-w-full overflow-x-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-lg transition ${
              isDragging ? "opacity-50 ring-2 ring-teal-400" : ""
            }`}
          >
            <div className="flex min-w-0 items-stretch border-b border-slate-700">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleSection(group.section)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSection(group.section);
                  }
                }}
                className="flex min-w-0 flex-1 cursor-pointer flex-col items-stretch gap-2 px-3 py-3 text-left transition hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-teal-400 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4"
              >
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <span
                    role="button"
                    tabIndex={0}
                    draggable
                    aria-label={`Drag ${group.section} section to reorder`}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      handleDragStart(group.section);
                    }}
                    onDragEnd={(event) => {
                      event.stopPropagation();
                      setDraggingSection(null);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="hidden cursor-grab select-none rounded-lg px-1 text-2xl text-slate-500 active:cursor-grabbing sm:inline"
                  >
                    ⋮⋮
                  </span>

                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-500/50 bg-teal-500/10 text-xl font-black text-teal-300 sm:h-10 sm:w-10 sm:text-2xl">
                    {isClosed ? "+" : "−"}
                  </span>

                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-black text-teal-400 sm:text-2xl">
                      {group.section}
                    </h2>

                    <p className="mt-0.5 text-xs font-bold text-slate-400 sm:mt-1 sm:text-sm">
                      {findings.length} finding
                      {findings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <span className="w-full rounded-xl border border-slate-600 px-4 py-2 text-center text-xs font-black text-slate-200 sm:w-auto sm:shrink-0 sm:text-sm">
                  {isClosed ? "Open" : "Close"}
                </span>
              </div>

              <div className="flex shrink-0 flex-col border-l border-slate-700">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    moveSection(index, index - 1);
                  }}
                  disabled={index === 0}
                  className="flex h-1/2 min-h-[36px] items-center justify-center px-3 text-sm font-black text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Move section up"
                >
                  ↑
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    moveSection(index, index + 1);
                  }}
                  disabled={index === orderedGroups.length - 1}
                  className="flex h-1/2 min-h-[36px] items-center justify-center border-t border-slate-700 px-3 text-sm font-black text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Move section down"
                >
                  ↓
                </button>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteSection(group.section, findings.length);
                }}
                disabled={deletingSection === group.section}
                title="Delete section"
                className="flex shrink-0 items-center justify-center border-l border-slate-700 px-3 text-sm font-black text-red-400 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletingSection === group.section ? "…" : "🗑"}
              </button>
            </div>

            <DeferredOpenSection active={!isClosed}>
              <div className="w-full max-w-full space-y-4 overflow-x-hidden p-2 sm:p-5">
                <SectionNotesEditor
                  inspectionId={inspectionId}
                  section={group.section}
                  initialNotes={sectionNotes?.[group.section] || ""}
                />

                <SectionInformationChecklist
                  inspectionId={inspectionId}
                  section={group.section}
                  weatherAddress={weatherContext?.address}
                  weatherDate={weatherContext?.date}
                  weatherHour={weatherContext?.hour}
                />

                <AISectionReview
                  inspectionId={inspectionId}
                  section={group.section}
                  findings={findings}
                />

                {group.section === "Inspection Details" && (
                  <ReportDisclaimers inspectionId={inspectionId} />
                )}

                <SectionLimitations
                  inspectionId={inspectionId}
                  section={group.section}
                />

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)]">
                  <AddSectionFindingForm
                    inspectionId={inspectionId}
                    section={group.section}
                    router={router}
                  />

                  <SectionReferencePhotos
                    inspectionId={inspectionId}
                    section={group.section}
                  />
                </div>

                {findings.length === 0 && (
                  <div className="rounded-xl border border-slate-700 bg-[#071224] p-5 text-slate-400">
                    No findings in this section.
                  </div>
                )}

                {findings.map((finding: any) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    inspectionId={inspectionId}
                    allPhotos={allPhotos}
                    availableSections={availableSections}
                    onNeedPhotoPicker={() => setPhotoPickerLoaded(true)}
                    router={router}
                  />
                ))}
              </div>
            </DeferredOpenSection>
          </section>
        );
      })}
    </div>
  );
}

function AddSectionFindingForm({
  inspectionId,
  section,
  router,
}: {
  inspectionId: string;
  section: string;
  router: any;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [location, setLocation] = useState("");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function pickAiValue(source: any, keys: string[]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    return "";
  }

  async function generateFromAiNote() {
    if (generatingAi || saving) return;

    const cleanNote = aiNote.trim();

    if (!cleanNote) {
      setMessage("Add an inspector note for AI to turn into a finding.");
      return;
    }

    setGeneratingAi(true);
    setMessage("");

    const requestBody = {
      note: cleanNote,
      inspector_note: cleanNote,
      prompt: cleanNote,
      section,
      severity,
      inspection_id: inspectionId,
    };

    const endpoints = [
      "/api/ai-suggest-finding",
      "/api/generate-finding",
      "/api/ai/finding",
    ];

    try {
      let data: any = null;
      let lastError = "";

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });

          const nextData = await response.json().catch(() => ({}));

          if (response.ok) {
            data =
              nextData?.finding ||
              nextData?.result ||
              nextData?.suggestion ||
              nextData;
            break;
          }

          lastError = nextData?.error || response.statusText || endpoint;
        } catch (error: any) {
          lastError = error?.message || endpoint;
        }
      }

      if (!data) {
        setMessage(
          lastError || "AI could not generate a finding from this note.",
        );
        return;
      }

      const nextTitle = pickAiValue(data, [
        "title",
        "finding_title",
        "defect_title",
        "name",
      ]);
      const nextSeverity = pickAiValue(data, [
        "severity",
        "priority",
        "category",
      ]);
      const nextObservation = pickAiValue(data, [
        "observation",
        "description",
        "comment",
        "summary",
      ]);
      const nextImplication = pickAiValue(data, [
        "implication",
        "impact",
        "why_it_matters",
      ]);
      const nextRecommendation = pickAiValue(data, [
        "recommendation",
        "recommended_action",
        "action",
      ]);

      setTitle(nextTitle || cleanNote.slice(0, 80));
      setSeverity(SEVERITIES.includes(nextSeverity) ? nextSeverity : severity);
      setObservation(nextObservation || cleanNote);
      setImplication(nextImplication);
      setRecommendation(nextRecommendation);
      setOpen(true);
      setMessage("AI note filled in. Review and save the defect.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to generate from AI note.");
    } finally {
      setGeneratingAi(false);
    }
  }

  async function createFinding() {
    if (saving) return;

    const cleanTitle = title.trim();
    const cleanObservation = observation.trim();

    if (!cleanTitle && !cleanObservation) {
      setMessage("Add a title or observation before saving.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase.from("findings").insert({
        inspection_id: inspectionId,
        section,
        severity,
        title: cleanTitle || cleanObservation.slice(0, 80) || "New Defect",
        location: location.trim() || null,
        observation: cleanObservation,
        implication: implication.trim(),
        recommendation: recommendation.trim(),
        image_url: null,
      });

      if (error) throw error;

      setTitle("");
      setLocation("");
      setObservation("");
      setImplication("");
      setRecommendation("");
      setAiNote("");
      setSeverity("Recommended Repair");
      setOpen(false);
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message || "Failed to add defect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-[#071224] p-4">
      {!open ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] hover:bg-cyan-400 sm:w-auto [touch-action:manipulation]"
          >
            ➕ Add Defect
          </button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 bg-purple-500/10 px-5 py-3 text-sm font-black text-purple-300 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white sm:w-auto [touch-action:manipulation]"
          >
            🤖 AI Note Inspector
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-cyan-300">
                Add Defect To {section}
              </h3>
              <p className="mt-0.5 text-xs font-bold text-slate-400 sm:mt-1 sm:text-sm">
                Create a normal finding without using AI Capture, Field Tool,
                Voice Tool, or Equipment Analyzer. Photos can be added after
                saving.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.includes("filled in") ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200" : "border-red-500/60 bg-red-500/10 text-red-200"}`}
            >
              {message}
            </div>
          )}

          <div className="rounded-xl border border-purple-500/50 bg-purple-500/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-base font-black text-purple-300">
                  🤖 AI Note Inspector
                </h4>
                <p className="mt-1 text-sm text-slate-300">
                  Type a rough field note and AI will turn it into a clean
                  defect. Review before saving.
                </p>
              </div>

              <button
                type="button"
                onClick={generateFromAiNote}
                disabled={generatingAi || saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-2 text-sm font-black text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
              >
                {generatingAi && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {generatingAi ? "Writing..." : "Generate From Note"}
              </button>
            </div>

            <textarea
              value={aiNote}
              onChange={(event) => setAiNote(event.target.value)}
              disabled={generatingAi || saving}
              placeholder="Example: garage GFCI kept tripping, recommend electrician evaluate and repair as needed"
              className="mt-4 min-h-[90px] w-full rounded-xl border border-purple-500/40 bg-slate-950 px-4 py-3 text-white outline-none focus:border-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
              placeholder="Defect title"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              disabled={saving}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {SEVERITIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              disabled={saving}
              placeholder="Location (e.g. Northeast corner, Master bathroom)"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
            />

            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              disabled={saving}
              placeholder="Observation"
              className="min-h-[110px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
            />

            <textarea
              value={implication}
              onChange={(event) => setImplication(event.target.value)}
              disabled={saving}
              placeholder="Implication / why it matters"
              className="min-h-[90px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <textarea
              value={recommendation}
              onChange={(event) => setRecommendation(event.target.value)}
              disabled={saving}
              placeholder="Recommendation"
              className="min-h-[90px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={createFinding}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
          >
            {saving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {saving ? "Saving..." : "Save Defect"}
          </button>
        </div>
      )}
    </div>
  );
}

function getSeverityStyle(severity: string | null | undefined) {
  const clean = String(severity || "Recommended Repair").toLowerCase();

  if (
    clean.includes("safety") ||
    clean.includes("hazard") ||
    clean.includes("major")
  ) {
    return "border-red-500/60 bg-red-500/10 text-red-300";
  }

  if (
    clean.includes("maintenance") ||
    clean.includes("monitor") ||
    clean.includes("minor")
  ) {
    return "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  if (
    clean.includes("information") ||
    clean.includes("info") ||
    clean.includes("client")
  ) {
    return "border-blue-500/60 bg-blue-500/10 text-blue-300";
  }

  return "border-teal-500/60 bg-teal-500/10 text-teal-300";
}

function getPhotoUrl(photo: any) {
  const path = String(
    photo?.file_path ||
      photo?.storage_path ||
      photo?.photo_path ||
      photo?.image_path ||
      photo?.video_path ||
      "",
  ).toLowerCase();
  const type = String(
    photo?.mime_type ||
      photo?.media_type ||
      photo?.content_type ||
      photo?.file_type ||
      "",
  ).toLowerCase();
  const isVideo =
    photo?.is_video === true ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    /\.(mp4|mov|m4v|webm|avi|quicktime)$/.test(path);

  if (isVideo) {
    return (
      // Prefer the fresh signed URL generated when the report loads.
      // Older signed_video_url values may be stale or expired.
      photo?.signed_url ||
      photo?.signedUrl ||
      photo?.signed_video_url ||
      photo?.signedVideoUrl ||
      photo?.video_url ||
      photo?.videoUrl ||
      photo?.public_url ||
      photo?.publicUrl ||
      photo?.url ||
      ""
    );
  }

  // Images must prefer their image URL aliases. A stale signed_video_url from
  // older report hydration must never override a newly marked-up image.
  return (
    photo?.signed_url ||
    photo?.signedUrl ||
    photo?.public_url ||
    photo?.publicUrl ||
    photo?.image_url ||
    photo?.imageUrl ||
    photo?.photo_url ||
    photo?.photoUrl ||
    photo?.url ||
    ""
  );
}

function getPhotoPreviewUrl(photo: any) {
  // Prefer signed URLs first. Public thumbnail URLs can fail in the inspector
  // editor when the storage bucket is private, which causes broken image cards.
  return (
    photo?.signed_thumbnail_url ||
    photo?.signedThumbnailUrl ||
    photo?.signed_url ||
    photo?.signedUrl ||
    photo?.signed_video_url ||
    photo?.signedVideoUrl ||
    photo?.thumbnail_url ||
    photo?.thumbnailUrl ||
    photo?.thumbnail_public_url ||
    photo?.thumbnailPublicUrl ||
    photo?.poster_url ||
    photo?.posterUrl ||
    photo?.signed_poster_url ||
    photo?.signedPosterUrl ||
    photo?.preview_url ||
    photo?.previewUrl ||
    photo?.public_url ||
    photo?.publicUrl ||
    photo?.image_url ||
    photo?.imageUrl ||
    photo?.photo_url ||
    photo?.photoUrl ||
    photo?.url ||
    ""
  );
}

function handleImageFallback(
  event: React.SyntheticEvent<HTMLImageElement>,
  fallbackUrl: string,
) {
  const image = event.currentTarget;

  if (fallbackUrl && image.src !== fallbackUrl) {
    image.src = fallbackUrl;
    return;
  }

  image.style.display = "none";
}

function isLikelyVideoUrl(value: any) {
  const clean = String(value || "")
    .toLowerCase()
    .split("?")[0];
  return /\.(mp4|mov|m4v|webm|avi|quicktime)$/.test(clean);
}

function getVideoPosterUrl(photo: any) {
  const posterUrl =
    photo?.signed_thumbnail_url ||
    photo?.signedThumbnailUrl ||
    photo?.thumbnail_url ||
    photo?.thumbnailUrl ||
    photo?.thumbnail_public_url ||
    photo?.thumbnailPublicUrl ||
    photo?.poster_url ||
    photo?.posterUrl ||
    photo?.signed_poster_url ||
    photo?.signedPosterUrl ||
    photo?.preview_url ||
    photo?.previewUrl ||
    "";

  const fullUrl = getPhotoUrl(photo);

  if (!posterUrl || posterUrl === fullUrl || isLikelyVideoUrl(posterUrl)) {
    return "";
  }

  return posterUrl;
}


function getVideoMimeType(photo: any, urlValue: any) {
  const explicit = String(
    photo?.mime_type ||
      photo?.media_type ||
      photo?.content_type ||
      photo?.file_type ||
      "",
  )
    .trim()
    .toLowerCase();

  const cleanUrl = String(urlValue || "")
    .toLowerCase()
    .split("?")[0];

  if (cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".m4v")) {
    return "video/mp4";
  }

  if (cleanUrl.endsWith(".webm")) {
    return "video/webm";
  }

  if (cleanUrl.endsWith(".mov") || cleanUrl.endsWith(".quicktime")) {
    return "video/quicktime";
  }

  if (cleanUrl.endsWith(".avi")) {
    return "video/x-msvideo";
  }

  if (explicit.startsWith("video/")) {
    return explicit;
  }

  return "";
}

function ReportVideo({
  photo,
  url,
  compact = false,
}: {
  photo: any;
  url: string;
  compact?: boolean;
}) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [failed, setFailed] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [muted, setMuted] = useState(true);
  const repairInProgressRef = useRef(false);
  const repairAttemptedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mimeType = getVideoMimeType(photo, currentUrl);

  useEffect(() => {
    setCurrentUrl(url);
    setFailed(false);
    setRepairing(false);
    setRepairError("");
    repairInProgressRef.current = false;
    repairAttemptedRef.current = false;
  }, [url, photo?.id]);

  async function repairVideo({ force = false }: { force?: boolean } = {}) {
    if (!photo?.id) {
      setRepairError("The original video record could not be identified.");
      setFailed(true);
      return;
    }

    if (repairInProgressRef.current) return;
    if (repairAttemptedRef.current && !force) return;

    repairInProgressRef.current = true;
    repairAttemptedRef.current = true;
    setRepairing(true);
    setFailed(false);
    setRepairError("");

    try {
      const response = await fetch("/api/repair-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: photo.id }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.signedUrl) {
        throw new Error(result?.error || "Automatic video optimization failed.");
      }

      setCurrentUrl(String(result.signedUrl));
      setRetryKey((current) => current + 1);
      setFailed(false);

      window.setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;

        video.load();
        void video.play().catch(() => undefined);
      }, 0);
    } catch (error: any) {
      setRepairError(error?.message || "Automatic video optimization failed.");
      setFailed(true);
    } finally {
      repairInProgressRef.current = false;
      setRepairing(false);
    }
  }

  if (repairing) {
    return (
      <div className="flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-teal-500/40 bg-teal-500/10 p-4 text-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-teal-200 border-t-transparent" />
        <p className="text-sm font-black text-teal-200">
          Optimizing video for playback…
        </p>
        <p className="max-w-xl text-xs leading-5 text-slate-300">
          This may take a few seconds. Keep this page open.
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
        <p className="text-sm font-black text-amber-200">
          We couldn&apos;t optimize this video automatically.
        </p>
        <p className="max-w-xl text-xs leading-5 text-slate-300">
          {repairError ||
            "The original may be incomplete or unavailable in storage."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void repairVideo({ force: true })}
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 transition active:scale-[0.98]"
          >
            Try Again
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-500 px-4 py-2 text-xs font-black text-white transition active:scale-[0.98] hover:bg-slate-800"
          >
            Open Original
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
    <button
      type="button"
      onClick={() => setMuted((current) => !current)}
      aria-label={muted ? "Unmute video" : "Mute video"}
      title={muted ? "Sound off — tap to unmute" : "Sound on — tap to mute"}
      className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full text-lg backdrop-blur ${
        muted ? "bg-red-600/80 text-white" : "bg-black/60 text-white"
      }`}
    >
      {muted ? "🔇" : "🔊"}
    </button>
    <video
      ref={videoRef}
      key={`${currentUrl}-${retryKey}`}
      poster={getVideoPosterUrl(photo) || undefined}
      controls
      muted={muted}
      playsInline
      preload="metadata"
      className={
        compact
          ? "h-36 w-full bg-black object-contain"
          : "mx-auto max-h-[420px] w-full max-w-full rounded-xl bg-black object-contain"
      }
      onError={() => {
        if (!repairAttemptedRef.current && photo?.id) {
          void repairVideo();
          return;
        }

        setRepairError("The optimized video still could not be played.");
        setFailed(true);
      }}
    >
      {mimeType ? (
        <source src={currentUrl} type={mimeType} />
      ) : (
        <source src={currentUrl} />
      )}
      Your browser does not support video playback.
    </video>
    </div>
  );
}

function isVideoMedia(photo: any) {
  const url = String(getPhotoUrl(photo) || "").toLowerCase();
  const path = String(
    photo?.file_path ||
      photo?.storage_path ||
      photo?.photo_path ||
      photo?.image_path ||
      photo?.video_path ||
      "",
  ).toLowerCase();
  const type = String(
    photo?.mime_type ||
      photo?.media_type ||
      photo?.content_type ||
      photo?.file_type ||
      "",
  ).toLowerCase();
  const title = String(
    photo?.title ||
      photo?.current_finding_title ||
      photo?.finding_title ||
      photo?.caption ||
      "",
  ).toLowerCase();

  return (
    Boolean(photo?.is_video) ||
    Boolean(photo?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    path.match(/\.(mp4|mov|m4v|webm|avi|quicktime)$/) !== null ||
    url.match(/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/) !== null ||
    title.includes("video")
  );
}

function normalizePhotoKey(value: any) {
  if (!value) return "";

  let clean = String(value).trim();

  if (!clean) return "";

  try {
    clean = decodeURIComponent(clean);
  } catch {}

  clean = clean.split("?")[0];

  const storageMarker = "/inspection-photos/";
  const storageIndex = clean.indexOf(storageMarker);

  if (storageIndex !== -1) {
    return clean.substring(storageIndex + storageMarker.length);
  }

  const publicMarker = "/object/public/inspection-photos/";
  const publicIndex = clean.indexOf(publicMarker);

  if (publicIndex !== -1) {
    return clean.substring(publicIndex + publicMarker.length);
  }

  const signedMarker = "/object/sign/inspection-photos/";
  const signedIndex = clean.indexOf(signedMarker);

  if (signedIndex !== -1) {
    return clean.substring(signedIndex + signedMarker.length);
  }

  return clean;
}

function getPhotoKeys(photo: any) {
  return [
    photo?.file_path,
    photo?.storage_path,
    photo?.photo_path,
    photo?.video_path,
    photo?.signed_video_url,
    photo?.video_url,
    photo?.signed_url,
    photo?.public_url,
    photo?.image_url,
    photo?.photo_url,
    photo?.url,
  ]
    .map(normalizePhotoKey)
    .filter(Boolean);
}

function hasSeenPhoto(seen: Set<string>, photo: any) {
  const keys = getPhotoKeys(photo);
  return keys.some((key) => seen.has(key));
}

function markPhotoSeen(seen: Set<string>, photo: any) {
  getPhotoKeys(photo).forEach((key) => seen.add(key));
}

function getFindingPhotos(finding: any) {
  const photos: any[] = [];
  const seen = new Set<string>();

  (finding.photos || []).forEach((photo: any) => {
    const url = getPhotoUrl(photo);
    const previewUrl = getPhotoPreviewUrl(photo);

    if (!url || hasSeenPhoto(seen, photo)) return;

    markPhotoSeen(seen, photo);
    photos.push(photo);
  });

  // Respect the inspector's saved photo order (stable sort keeps insertion
  // order for ties / un-ordered legacy photos).
  photos.sort(
    (a, b) => (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0),
  );

  const legacyImage =
    finding.signed_image_url ||
    finding.image_url ||
    finding.public_image_url ||
    "";

  const legacyPhoto = {
    id: `legacy-${finding.id}`,
    signed_url: legacyImage,
    signed_video_url: finding.signed_video_url || finding.video_url || "",
    video_url: finding.video_url || "",
    public_url: legacyImage,
    image_url: legacyImage,
    file_path:
      finding.file_path ||
      finding.storage_path ||
      finding.photo_path ||
      finding.image_path ||
      finding.video_path ||
      "",
    mime_type:
      finding.mime_type ||
      finding.media_type ||
      finding.content_type ||
      finding.file_type ||
      "",
    title:
      finding.title ||
      finding.finding_title ||
      finding.defect_title ||
      finding.name ||
      "",
    is_video:
      finding.is_video ||
      finding.media_type === "video" ||
      Boolean(finding.video_url),
    isLegacyImage: true,
  };

  // Only use the legacy image stored directly on the finding when there are
  // no normal photo records. Once a finding has photos-table media, showing
  // the legacy image creates a duplicate/broken card that cannot be deleted
  // through the normal photo workflow.
  if (
    photos.length === 0 &&
    legacyImage &&
    !hasSeenPhoto(seen, legacyPhoto)
  ) {
    photos.unshift(legacyPhoto);
  }

  return photos;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image file."));
    };

    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromDataUrl(
  dataUrl: string,
): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = dataUrl;
  });
}

async function createImageVariantForUpload(
  file: File,
  maxDimension: number,
  quality: number,
  suffix: string,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromDataUrl(originalDataUrl);

    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    const scale = Math.min(
      1,
      maxDimension / Math.max(originalWidth, originalHeight),
    );
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    const originalName = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${originalName}-${suffix}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

async function createFullImageForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(file, 1800, 0.8, "optimized");
}

async function createThumbnailForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(file, 480, 0.7, "thumb");
}

async function dataUrlToFile(
  dataUrl: string,
  filename: string,
): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (!blob.size) {
    throw new Error("The marked-up image was empty.");
  }

  return new File([blob], filename, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now(),
  });
}

async function verifyImageCanLoad(url: string): Promise<void> {
  if (!url) throw new Error("The marked-up image URL was not created.");

  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      reject(new Error("The marked-up image could not be verified."));
    }, 15000);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("The marked-up image could not be opened after upload."));
    };

    image.src = url;
  });
}

async function createVideoThumbnailForUpload(file: File): Promise<File | null> {
  if (!file.type.startsWith("video/")) return null;

  return await new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timeout = window.setTimeout(() => finish(null), 3500);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = objectUrl;

    video.onerror = () => finish(null);

    video.onloadedmetadata = () => {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.min(Math.max(duration * 0.25, 0.25), 2);
      } catch {
        finish(null);
      }
    };

    video.onseeked = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          finish(null);
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finish(null);
              return;
            }

            finish(
              new File([blob], `video-thumb-${Date.now()}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              }),
            );
          },
          "image/jpeg",
          0.78,
        );
      } catch {
        finish(null);
      }
    };
  });
}

function FindingCardBase({
  finding,
  inspectionId,
  allPhotos,
  availableSections,
  onNeedPhotoPicker,
  router,
}: any) {
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoPickerLimit, setPhotoPickerLimit] = useState(
    PHOTO_PICKER_PAGE_SIZE,
  );
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [movingPhotoId, setMovingPhotoId] = useState<string | null>(null);
  const [markupPhoto, setMarkupPhoto] = useState<any | null>(null);
  const [showMarkupEditor, setShowMarkupEditor] = useState(false);
  const [dragPhotoIndex, setDragPhotoIndex] = useState<number | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [aiInspectorNote, setAiInspectorNote] = useState("");
  const [aiInspectorBusy, setAiInspectorBusy] = useState(false);
  const [localFinding, setLocalFinding] = useState<any>(finding);
  const displayFinding = localFinding || finding;

  useEffect(() => {
    setLocalFinding(finding);
  }, [finding]);

  const photos = getFindingPhotos(displayFinding);
  const hiddenPhotoCount = Math.max(
    0,
    photos.length - AUTO_PREVIEW_PHOTO_LIMIT,
  );
  const visiblePhotos = showAllPhotos
    ? photos
    : photos.slice(0, AUTO_PREVIEW_PHOTO_LIMIT);

  const findingAnchor = getFindingAnchor(finding);
  const isSafetyOrMajor =
    String(displayFinding.severity || "")
      .toLowerCase()
      .includes("safety") ||
    String(displayFinding.severity || "")
      .toLowerCase()
      .includes("major") ||
    String(displayFinding.severity || "")
      .toLowerCase()
      .includes("hazard");

  useEffect(() => {
    function openIfTargeted(event?: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const targetAnchor = String(detail.targetAnchor || "").replace(/^#/, "");
      const findingIds = Array.isArray(detail.findingIds)
        ? detail.findingIds.map((value: any) => String(value))
        : [];
      const shouldOpen =
        targetAnchor === findingAnchor ||
        findingIds.includes(String(finding.id));

      if (!shouldOpen) return;

      setExpanded(true);
      window.setTimeout(() => {
        const element = document.getElementById(findingAnchor);
        if (element)
          element.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }

    // Only open a finding when Command Center dispatches an explicit jump event.
    // This prevents the report page from auto-scrolling on initial load.
    window.addEventListener(
      "opi:command-center-jump",
      openIfTargeted as EventListener,
    );

    return () => {
      window.removeEventListener(
        "opi:command-center-jump",
        openIfTargeted as EventListener,
      );
    };
  }, [finding.id, findingAnchor]);

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  }

  function pickAiInspectorValue(source: any, keys: string[]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    return "";
  }

  async function runAiInspectorNoteRewrite() {
    if (aiInspectorBusy) return;

    const cleanNote = aiInspectorNote.trim();

    if (!cleanNote) {
      showMessage("error", "Add an AI Inspector note first.");
      return;
    }

    setAiInspectorBusy(true);
    showMessage("success", "AI Inspector is adjusting this finding...");

    const currentFinding = {
      id: finding.id,
      title:
        displayFinding.title ||
        displayFinding.finding_title ||
        displayFinding.defect_title ||
        displayFinding.name ||
        "Untitled Finding",
      section: displayFinding.section || "Inspection Details",
      severity: displayFinding.severity || "Recommended Repair",
      observation: displayFinding.observation || "",
      implication: displayFinding.implication || "",
      recommendation: displayFinding.recommendation || "",
    };

    const requestBody = {
      mode: "rewrite_existing_finding",
      finding: currentFinding,
      inspectorCorrection: cleanNote,

      // Keep the legacy fields so this remains compatible with the API route
      // while the structured rewrite data prevents the title from becoming
      // the primary source of truth.
      note: cleanNote,
      inspector_note: cleanNote,
      title: currentFinding.title,
      section: currentFinding.section,
      severity: currentFinding.severity,
      observation: currentFinding.observation,
      implication: currentFinding.implication,
      recommendation: currentFinding.recommendation,
      finding_id: finding.id,
      inspection_id: inspectionId,
      instructions: [
        "Edit this existing finding; do not create a different defect.",
        "Treat the observation, implication, and recommendation as the source of truth, not only the title.",
        "Apply the inspector correction exactly.",
        "Preserve fields that the inspector did not ask to change.",
        "Do not invent facts, damage, code violations, or concealed conditions.",
      ],
    };

    try {
      const response = await fetch("/api/ai-adjust-finding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const nextData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          nextData?.error || response.statusText || "AI Inspector rewrite failed.",
        );
      }

      const data =
        nextData?.finding ||
        nextData?.result ||
        nextData?.suggestion ||
        nextData;

      const nextTitle =
        pickAiInspectorValue(data, [
          "title",
          "finding_title",
          "defect_title",
          "name",
        ]) || currentFinding.title;
      const nextSection =
        pickAiInspectorValue(data, ["section", "suggested_section"]) ||
        currentFinding.section;
      const nextSeverity =
        pickAiInspectorValue(data, [
          "severity",
          "suggested_severity",
          "priority",
          "category",
        ]) || currentFinding.severity;
      const nextObservation =
        pickAiInspectorValue(data, [
          "observation",
          "description",
          "comment",
          "summary",
        ]) || currentFinding.observation;
      const nextImplication =
        pickAiInspectorValue(data, [
          "implication",
          "impact",
          "why_it_matters",
        ]) || currentFinding.implication;
      const nextRecommendation =
        pickAiInspectorValue(data, [
          "recommendation",
          "recommended_action",
          "action",
        ]) || currentFinding.recommendation;

      const updatedFinding = {
        title: nextTitle,
        section: nextSection,
        severity: nextSeverity,
        observation: nextObservation,
        implication: nextImplication,
        recommendation: nextRecommendation,
      };

      const { data: savedFinding, error } = await supabase
        .from("findings")
        .update(updatedFinding)
        .eq("id", finding.id)
        .eq("inspection_id", inspectionId)
        .select("*")
        .single();

      if (error) throw error;

      if (!savedFinding?.id) {
        throw new Error(
          "The finding update was not confirmed. Please reload and try again.",
        );
      }

      // Use the exact row returned by Supabase so the report card and editor
      // immediately display what was actually saved.
      setLocalFinding((current: any) => ({
        ...(current || finding),
        ...savedFinding,
      }));

      setAiInspectorNote("");
      showMessage(
        "success",
        "AI Inspector adjustment saved to the actual finding.",
      );

      // Do not immediately refresh the route here. The report-page listener
      // can replace the fresh local result with stale server props.
      window.dispatchEvent(
        new CustomEvent("opi:finding-ai-updated", {
          detail: {
            inspectionId,
            findingId: finding.id,
            section: savedFinding.section || nextSection,
            finding: savedFinding,
          },
        }),
      );
    } catch (error: any) {
      showMessage("error", error?.message || "AI Inspector rewrite failed.");
    } finally {
      setAiInspectorBusy(false);
    }
  }

  async function uploadNewPhotosToFinding(fileList: FileList | null) {
    const files = Array.from(fileList || []);

    if (!files.length) return;

    const mediaFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/"),
    );

    if (!mediaFiles.length) {
      showMessage("error", "Please choose photos or videos.");
      return;
    }

    setUploadingPhotos(true);

    try {
      for (const file of mediaFiles) {
        let uploadFile = file;
        let thumbnailFile: File | null = null;
        let isVideo = false;

        if (file.type.startsWith("video/")) {
          isVideo = true;
          showMessage("success", "Preparing video for report...");

          // Conversion to MP4 is best-effort. If it fails (server timeout,
          // unsupported codec, ffmpeg issue), fall back to saving the ORIGINAL
          // video so it's never silently dropped — matching the Field Tool.
          try {
            const formData = new FormData();
            formData.append("video", file);

            const response = await fetch("/api/video-convert", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const errorText = await response.text().catch(() => "");
              throw new Error(errorText || "Video conversion failed");
            }

            const convertedBlob = await response.blob();

            if (!convertedBlob || convertedBlob.size === 0) {
              throw new Error("Video conversion returned an empty MP4.");
            }

            uploadFile = new File([convertedBlob], `video-${Date.now()}.mp4`, {
              type: "video/mp4",
            });
          } catch (convertError) {
            console.warn(
              "Video conversion failed; uploading the original video instead.",
              convertError,
            );
            uploadFile = file;
          }

          thumbnailFile = await createVideoThumbnailForUpload(uploadFile).catch(
            () => null,
          );
        } else {
          uploadFile = await createFullImageForUpload(file);
          thumbnailFile = await createThumbnailForUpload(file);
        }

        const fileExt = isVideo
          ? (uploadFile.name.split(".").pop() ||
              uploadFile.type.split("/")[1] ||
              "mp4")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .slice(0, 4) || "mp4"
          : "jpg";
        const safeName = uploadFile.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9-_]/g, "-")
          .slice(0, 50);

        const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
        const filePath = `${inspectionId}/finding-photos/${finding.id}/${baseName}.${fileExt}`;
        const thumbnailPath = `${inspectionId}/finding-photos/${finding.id}/thumbnails/${baseName}-thumb.jpg`;

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(filePath, uploadFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType:
              uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from(PHOTO_BUCKET)
          .getPublicUrl(filePath);

        let thumbnailUrl = "";

        if (thumbnailFile) {
          const { error: thumbnailUploadError } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(thumbnailPath, thumbnailFile, {
              cacheControl: "31536000",
              upsert: false,
              contentType: "image/jpeg",
            });

          if (!thumbnailUploadError) {
            const { data: thumbnailData } = supabase.storage
              .from(PHOTO_BUCKET)
              .getPublicUrl(thumbnailPath);

            thumbnailUrl = thumbnailData.publicUrl;
          }
        }

        const { error: insertError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          finding_id: finding.id,
          file_path: filePath,
          public_url: publicData.publicUrl,
          thumbnail_path: thumbnailUrl ? thumbnailPath : null,
          thumbnail_url: thumbnailUrl || null,
          is_video: isVideo,
          mime_type: uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
        });

        if (insertError) throw insertError;
      }

      setShowUploadPanel(false);
      showMessage(
        "success",
        mediaFiles.length === 1
          ? "Media added to finding."
          : "Media files added to finding.",
      );
      router.refresh();
    } catch (error: any) {
      showMessage(
        "error",
        error?.message || "Failed to add media to this finding.",
      );
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleFindingDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingOver(false);

    if (uploadingPhotos) return;

    await uploadNewPhotosToFinding(event.dataTransfer?.files || null);
  }

  async function movePhotoToFinding(photo: any) {
    if (!photo?.id || photo.isLegacyImage) {
      showMessage(
        "error",
        "This older image does not have a movable photo record.",
      );
      return;
    }

    if (
      String(photo.finding_id || photo.current_finding_id || "") ===
      String(finding.id)
    ) {
      showMessage("error", "This photo is already attached to this finding.");
      return;
    }

    const confirmed = window.confirm(
      "Move this photo to this finding? It will no longer appear under the previous finding.",
    );

    if (!confirmed) return;

    setMovingPhotoId(String(photo.id));

    try {
      const { error } = await supabase
        .from("photos")
        .update({ finding_id: finding.id })
        .eq("id", photo.id)
        .eq("inspection_id", inspectionId);

      if (error) throw error;

      setShowPhotoPicker(false);
      showMessage("success", "Photo moved to this finding.");
      router.refresh();
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to move photo.");
    } finally {
      setMovingPhotoId(null);
    }
  }

  // Reorder this finding's photos by renumbering sort_order for the whole set,
  // so the order is stable regardless of the photos' existing sort_order values.
  // Used by both the up/down arrows and drag-and-drop.
  async function reorderFindingPhotos(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= photos.length ||
      toIndex >= photos.length
    ) {
      return;
    }

    const reordered = [...photos];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setMovingPhotoId(String(photos[fromIndex]?.id || ""));

    try {
      await Promise.all(
        reordered.map((entry, position) => {
          const photoId = String(entry?.id || "");
          if (!photoId || entry?.isLegacyImage || photoId.startsWith("legacy-")) {
            return Promise.resolve();
          }
          return supabase
            .from("photos")
            .update({ sort_order: position })
            .eq("id", photoId)
            .eq("inspection_id", inspectionId);
        }),
      );
      router.refresh();
    } catch {
      showMessage("error", "Could not reorder photos. Please try again.");
    } finally {
      setMovingPhotoId(null);
    }
  }

  function moveFindingPhoto(index: number, direction: number) {
    void reorderFindingPhotos(index, index + direction);
  }

  async function deletePhotoFromFinding(photo: any) {
    if (!photo?.id || photo.isLegacyImage) {
      showMessage(
        "error",
        "This older image is stored directly on the finding. Edit the finding image field or delete the finding to remove it.",
      );
      return;
    }

    const confirmed = window.confirm(
      "Delete this photo from the report? This removes the photo record from this finding. The original storage file is left alone for safety.",
    );

    if (!confirmed) return;

    setMovingPhotoId(String(photo.id));

    try {
      const { error } = await supabase
        .from("photos")
        .delete()
        .eq("id", photo.id)
        .eq("inspection_id", inspectionId);

      if (error) throw error;

      showMessage("success", "Photo deleted from finding.");
      router.refresh();
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to delete photo.");
    } finally {
      setMovingPhotoId(null);
    }
  }

  const findingTitle =
    displayFinding.title ||
    displayFinding.finding_title ||
    displayFinding.defect_title ||
    displayFinding.name ||
    "Untitled Finding";

  const primaryPhoto = photos[0] || null;
  const primaryPhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto) : "";
  const primaryPreviewUrl = primaryPhoto
    ? getPhotoPreviewUrl(primaryPhoto)
    : "";

  if (!expanded) {
    return (
      <article
        id={findingAnchor}
        data-command-target={findingAnchor}
        data-finding-id={String(finding.id || "")}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!uploadingPhotos) setDraggingOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraggingOver(false);
        }}
        onDrop={handleFindingDrop}
        className={`w-full max-w-full overflow-x-hidden rounded-2xl border bg-[#071224] shadow-lg transition ${
          draggingOver
            ? "border-teal-400 ring-2 ring-teal-400/40"
            : "border-slate-700"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full min-w-0 gap-2 p-2 text-left transition hover:bg-slate-800/40 sm:gap-4 sm:p-4 [touch-action:manipulation]"
        >
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-black sm:h-28 sm:w-32">
            {primaryPhotoUrl ? (
              isVideoMedia(primaryPhoto) ? (
                getVideoPosterUrl(primaryPhoto) ? (
                  <div className="relative h-full w-full bg-black">
                    <img
                      src={getVideoPosterUrl(primaryPhoto)}
                      alt={findingTitle}
                      onError={(event) =>
                        handleImageFallback(event, primaryPhotoUrl)
                      }
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      width={320}
                      height={240}
                      sizes="128px"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-3xl text-white">
                      ▶
                    </span>
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-black text-xs font-black uppercase tracking-wide text-cyan-300">
                    ▶ Video
                  </div>
                )
              ) : (
                <img
                  src={primaryPreviewUrl || primaryPhotoUrl}
                  alt={findingTitle}
                  onError={(event) =>
                    handleImageFallback(event, primaryPhotoUrl)
                  }
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  width={320}
                  height={240}
                  sizes="128px"
                  className="h-full w-full object-cover"
                />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-500">
                No Photo
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 sm:mb-2 sm:gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${getSeverityStyle(
                  displayFinding.severity,
                )}`}
              >
                {displayFinding.severity || "Recommended Repair"}
              </span>

              {photos.length > 0 && (
                <span className="rounded-full border border-cyan-600 bg-cyan-950/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                  {photos.length} media
                </span>
              )}
            </div>

            <h3 className="line-clamp-2 break-words text-base font-black leading-tight text-white sm:text-xl">
              {findingTitle}
            </h3>

            {displayFinding.location && (
              <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-400 sm:text-sm">
                📍 {displayFinding.location}
              </p>
            )}

            {displayFinding.observation && (
              <p className="mt-1 line-clamp-1 text-xs font-semibold leading-5 text-slate-300 sm:mt-2 sm:line-clamp-2 sm:text-sm sm:leading-6">
                {displayFinding.observation}
              </p>
            )}

            <p className="mt-2 text-xs font-black text-cyan-300 sm:mt-3 sm:text-sm">
              Open / Edit Finding →
            </p>
          </div>
        </button>

        {draggingOver && (
          <div className="mx-3 mb-3 rounded-xl border border-teal-400 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-200">
            Drop photos or videos here to attach them to this defect.
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      id={findingAnchor}
      data-command-target={findingAnchor}
      data-finding-id={String(finding.id || "")}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!uploadingPhotos) setDraggingOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDraggingOver(false);
      }}
      onDrop={handleFindingDrop}
      className={`w-full max-w-full overflow-x-hidden rounded-2xl border bg-[#071224] shadow-xl transition ${
        draggingOver
          ? "border-teal-400 ring-2 ring-teal-400/40"
          : "border-slate-700"
      }`}
    >
      <div className="p-2 pb-0 sm:p-4 sm:pb-0">
        <InlineStatusMessage type={messageType} message={message} />
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap justify-end gap-2 rounded-2xl border border-slate-700 bg-[#071224]/95 p-2 shadow-xl backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          {isSafetyOrMajor && (
            <button
              type="button"
              onClick={() => {
                markFindingReviewedForCommandCenter(finding.id);
                showMessage(
                  "success",
                  "Marked reviewed in Command Center. If the finding is still a safety concern, update the severity or recommendation before publishing.",
                );
              }}
              className="rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-sm font-black text-emerald-300 hover:bg-emerald-500 hover:text-slate-950"
            >
              Mark Reviewed
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-300 hover:bg-slate-800"
          >
            Collapse Finding
          </button>
        </div>
        {draggingOver && (
          <div className="mt-3 rounded-xl border border-teal-400 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-200">
            Drop photos or videos here to attach them to this defect.
          </div>
        )}
      </div>
      {photos.length > 0 && (
        <div className="border-b border-slate-700 bg-black p-2 sm:p-3">
          <div className="grid gap-3">
            {visiblePhotos.map((photo: any, index: number) => {
              const url = getPhotoUrl(photo);
              const previewUrl = getPhotoPreviewUrl(photo);
              const isBusy = movingPhotoId === String(photo.id);

              const isPhotoDraggable = !photo?.isLegacyImage && !String(photo?.id || "").startsWith("legacy-");

              return (
                <div
                  key={String(photo.id || photo.file_path || url || index)}
                  draggable={isPhotoDraggable}
                  onDragStart={() => setDragPhotoIndex(index)}
                  onDragOver={(event) => {
                    if (dragPhotoIndex !== null) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragPhotoIndex !== null && dragPhotoIndex !== index) {
                      void reorderFindingPhotos(dragPhotoIndex, index);
                    }
                    setDragPhotoIndex(null);
                  }}
                  onDragEnd={() => setDragPhotoIndex(null)}
                  className={`w-full max-w-full overflow-x-hidden rounded-xl border bg-slate-950 transition ${
                    dragPhotoIndex === index
                      ? "border-teal-400 opacity-60"
                      : dragPhotoIndex !== null
                        ? "border-dashed border-teal-500/50"
                        : "border-slate-700"
                  } ${isPhotoDraggable ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  {isVideoMedia(photo) ? (
                    <div className="flex justify-center rounded-xl bg-black p-2">
                      <ReportVideo photo={photo} url={url} />
                    </div>
                  ) : (
                    <ExpandableReportImage
                      src={previewUrl || url}
                      fullSrc={url}
                      alt={`Finding photo ${index + 1}`}
                      className={
                        visiblePhotos.length === 1
                          ? "max-h-[650px] w-full object-contain"
                          : "h-56 w-full object-contain"
                      }
                      buttonClassName="block w-full overflow-hidden bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                      badgeText="Tap to enlarge"
                    />
                  )}

                  <div className="border-t border-slate-800 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
                      <span>
                        {isVideoMedia(photo) ? "Video" : "Photo"} {index + 1}
                      </span>

                      <div className="flex flex-wrap gap-2">
                        {!isVideoMedia(photo) && (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                moveFindingPhoto(index, -1);
                              }}
                              disabled={isBusy || index === 0}
                              title="Move photo up"
                              className="rounded-lg border border-slate-600 px-2 py-1 font-black text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                moveFindingPhoto(index, 1);
                              }}
                              disabled={isBusy || index === visiblePhotos.length - 1}
                              title="Move photo down"
                              className="rounded-lg border border-slate-600 px-2 py-1 font-black text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMarkupPhoto(photo);
                                setShowMarkupEditor(true);
                              }}
                              disabled={isBusy}
                              className="rounded-lg border border-purple-500 px-3 py-1 font-black text-purple-300 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ✏️ Markup
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deletePhotoFromFinding(photo);
                          }}
                          disabled={isBusy}
                          className="rounded-lg border border-red-600 px-3 py-1 font-black text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? "Working..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    <PhotoCaptionField photo={photo} inspectionId={inspectionId} />
                  </div>
                </div>
              );
            })}
          </div>

          {hiddenPhotoCount > 0 && !showAllPhotos && (
            <button
              type="button"
              onClick={() => setShowAllPhotos(true)}
              className="mt-3 w-full rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-300 transition hover:bg-cyan-500/20"
            >
              Load {hiddenPhotoCount} more media
            </button>
          )}

          {showAllPhotos && photos.length > AUTO_PREVIEW_PHOTO_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllPhotos(false)}
              className="mt-3 w-full rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-300 transition hover:bg-slate-800"
            >
              Show fewer photos
            </button>
          )}
        </div>
      )}

      <div className="w-full max-w-full overflow-x-hidden p-3 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${getSeverityStyle(
              displayFinding.severity,
            )}`}
          >
            {displayFinding.severity || "Recommended Repair"}
          </span>

          {displayFinding.section && (
            <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">
              {displayFinding.section}
            </span>
          )}

          {photos.length > 0 && (
            <span className="rounded-full border border-cyan-600 bg-cyan-950/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-300">
              {photos.length} media
            </span>
          )}
        </div>

        <h3 className="mb-1 break-words text-2xl font-black text-white">
          {findingTitle}{" "}
        </h3>

        {displayFinding.location && (
          <p className="mb-4 flex items-center gap-1 text-sm font-bold text-slate-400">
            📍 {displayFinding.location}
          </p>
        )}

        <div className="mb-4 grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={async (event) => {
              event.stopPropagation();

              try {
                const res = await fetch("/api/save-finding-template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title:
                      displayFinding.title ||
                      displayFinding.finding_title ||
                      displayFinding.defect_title ||
                      displayFinding.name ||
                      "Untitled Finding",
                    section: displayFinding.section || "Inspection Details",
                    severity: displayFinding.severity || "Recommended Repair",
                    observation: displayFinding.observation || "",
                    implication: displayFinding.implication || "",
                    recommendation: displayFinding.recommendation || "",
                  }),
                });

                let data: any = {};

                try {
                  data = await res.json();
                } catch {
                  data = {};
                }

                if (!res.ok) {
                  showMessage(
                    "error",
                    data.error || "Failed to save template.",
                  );
                  return;
                }

                showMessage("success", "Template saved!");
              } catch {
                showMessage("error", "Failed to save template.");
              }
            }}
            className="w-full rounded-xl border border-yellow-500 px-3 py-3 text-xs font-black text-yellow-300 transition active:scale-[0.98] hover:bg-yellow-500/10 sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            ⭐ Save as Template
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowUploadPanel((prev) => !prev);
              setShowPhotoPicker(false);
            }}
            className="w-full rounded-xl border border-teal-500 px-3 py-3 text-xs font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500/10 sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            📷 Add Media
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNeedPhotoPicker?.();
              setPhotoPickerLimit(PHOTO_PICKER_PAGE_SIZE);
              setShowPhotoPicker((prev) => !prev);
              setShowUploadPanel(false);
            }}
            className="w-full rounded-xl border border-cyan-500 px-3 py-3 text-xs font-black text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500/10 sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            📎 Move Existing Photo
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();

              if (!photos.length) {
                showMessage("error", "This finding has no photos.");
                return;
              }

              setMarkupPhoto(photos[0]);
              setShowMarkupEditor(true);
            }}
            className="w-full rounded-xl border border-purple-500 px-3 py-3 text-xs font-black text-purple-300 transition active:scale-[0.98] hover:bg-purple-500/10 sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            ✏️ Markup Photo
          </button>
        </div>

        {showUploadPanel && (
          <div className="mb-4 w-full max-w-full overflow-x-hidden rounded-xl border border-teal-700 bg-teal-950/20 p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-lg font-black text-teal-300">
                  Add Media To This Defect
                </h4>
                <p className="mt-1 text-sm text-slate-300">
                  These photos or videos save to this existing finding only.
                  They do not create a new defect and they do not affect section
                  reference photos. You can also drag and drop photos or videos
                  onto this defect card.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowUploadPanel(false)}
                className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 sm:w-auto"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-black text-teal-300 hover:bg-teal-500 hover:text-slate-950">
                {uploadingPhotos ? "Uploading..." : "📷 Take Photo"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  multiple
                  disabled={uploadingPhotos}
                  onChange={async (event) => {
                    await uploadNewPhotosToFinding(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-black text-cyan-300 hover:bg-cyan-500 hover:text-slate-950">
                {uploadingPhotos ? "Uploading..." : "🖼 Choose Media"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={uploadingPhotos}
                  onChange={async (event) => {
                    await uploadNewPhotosToFinding(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {showPhotoPicker && (
          <div className="mb-4 w-full max-w-full overflow-x-hidden rounded-xl border border-cyan-700 bg-cyan-950/20 p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-lg font-black text-cyan-300">
                  Add Existing Photo To This Finding
                </h4>
                <p className="mt-1 text-sm text-slate-300">
                  Select a photo from this report. It will be moved from its
                  current finding to this one.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPhotoPicker(false)}
                className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 sm:w-auto"
              >
                Close
              </button>
            </div>

            {allPhotos.length === 0 ? (
              <p className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-400">
                No movable photo records were found in this report yet.
              </p>
            ) : (
              <>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {allPhotos
                    .slice(0, photoPickerLimit)
                    .map((photo: any, index: number) => {
                      const url = getPhotoUrl(photo);
                      const previewUrl = getPhotoPreviewUrl(photo);
                      const alreadyAttached =
                        String(
                          photo.finding_id || photo.current_finding_id || "",
                        ) === String(finding.id);

                      return (
                        <div
                          key={String(photo.id || photo.file_path || index)}
                          className="w-full max-w-full overflow-x-hidden rounded-xl border border-slate-700 bg-slate-950"
                        >
                          {url ? (
                            isVideoMedia(photo) ? (
                              <ReportVideo photo={photo} url={url} compact />
                            ) : (
                              <img
                                src={previewUrl || url}
                                alt={`Report photo ${index + 1}`}
                                onError={(event) =>
                                  handleImageFallback(event, url)
                                }
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                                width={480}
                                height={320}
                                sizes="(max-width: 640px) 94vw, (max-width: 1024px) 48vw, 25vw"
                                className="h-36 w-full object-contain"
                              />
                            )
                          ) : (
                            <div className="flex h-36 items-center justify-center text-sm text-slate-500">
                              No preview
                            </div>
                          )}

                          <div className="space-y-2 border-t border-slate-800 p-3">
                            <p className="line-clamp-2 text-xs font-bold text-slate-300">
                              {photo.current_section} ·{" "}
                              {photo.current_finding_title}
                            </p>

                            <button
                              type="button"
                              onClick={() => movePhotoToFinding(photo)}
                              disabled={
                                alreadyAttached ||
                                movingPhotoId === String(photo.id)
                              }
                              className="w-full rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {alreadyAttached
                                ? "Already Here"
                                : movingPhotoId === String(photo.id)
                                  ? "Moving..."
                                  : "Move Here"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {allPhotos.length > photoPickerLimit && (
                  <button
                    type="button"
                    onClick={() =>
                      setPhotoPickerLimit(
                        (prev) => prev + PHOTO_PICKER_PAGE_SIZE,
                      )
                    }
                    className="mt-3 w-full rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-300 transition hover:bg-cyan-500/20"
                  >
                    Load{" "}
                    {Math.min(
                      PHOTO_PICKER_PAGE_SIZE,
                      allPhotos.length - photoPickerLimit,
                    )}{" "}
                    more photos
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {showMarkupEditor && markupPhoto && (
          <PhotoMarkupEditor
            imageUrl={getPhotoUrl(markupPhoto)}
            severity={displayFinding.severity}
            onCancel={() => {
              setShowMarkupEditor(false);
              setMarkupPhoto(null);
              document.body.style.removeProperty("overflow");
              document.documentElement.style.removeProperty("overflow");
              document.body.style.removeProperty("touch-action");
              document.documentElement.style.removeProperty("touch-action");
            }}
            onSave={async (items, flattenedDataUrl) => {
              const photoId = String(markupPhoto?.id || "").trim();

              if (!photoId || markupPhoto?.isLegacyImage) {
                throw new Error(
                  "This older photo cannot be replaced by the markup editor. Re-upload it to the finding first.",
                );
              }

              const markedFile = await dataUrlToFile(
                flattenedDataUrl,
                `marked-photo-${Date.now()}.jpg`,
              );
              const thumbnailFile = await createThumbnailForUpload(markedFile);
              const baseName = `${Date.now()}-${crypto.randomUUID()}-marked`;
              const filePath = `${inspectionId}/finding-photos/${finding.id}/${baseName}.jpg`;
              const thumbnailPath = `${inspectionId}/finding-photos/${finding.id}/thumbnails/${baseName}-thumb.jpg`;

              const { error: uploadError } = await supabase.storage
                .from(PHOTO_BUCKET)
                .upload(filePath, markedFile, {
                  cacheControl: "31536000",
                  upsert: false,
                  contentType: "image/jpeg",
                });

              if (uploadError) throw uploadError;

              const { error: thumbnailUploadError } = await supabase.storage
                .from(PHOTO_BUCKET)
                .upload(thumbnailPath, thumbnailFile, {
                  cacheControl: "31536000",
                  upsert: false,
                  contentType: "image/jpeg",
                });

              if (thumbnailUploadError) {
                await supabase.storage.from(PHOTO_BUCKET).remove([filePath]);
                throw thumbnailUploadError;
              }

              const { data: fullPublicData } = supabase.storage
                .from(PHOTO_BUCKET)
                .getPublicUrl(filePath);
              const { data: thumbPublicData } = supabase.storage
                .from(PHOTO_BUCKET)
                .getPublicUrl(thumbnailPath);

              // The inspection-photos bucket may be private. Public URLs can
              // therefore appear valid but render as broken images. Generate
              // fresh signed URLs for immediate report display.
              const [signedFullResult, signedThumbResult] = await Promise.all([
                supabase.storage
                  .from(PHOTO_BUCKET)
                  .createSignedUrl(filePath, 60 * 60 * 24 * 7),
                supabase.storage
                  .from(PHOTO_BUCKET)
                  .createSignedUrl(thumbnailPath, 60 * 60 * 24 * 7),
              ]);

              const displayFullUrl =
                signedFullResult.data?.signedUrl ||
                fullPublicData.publicUrl;
              const displayThumbnailUrl =
                signedThumbResult.data?.signedUrl ||
                displayFullUrl;

              // Verify both uploaded files before changing the existing photo
              // record. If verification fails, the original report photo stays
              // untouched and the new temporary files are removed.
              try {
                await Promise.all([
                  verifyImageCanLoad(displayFullUrl),
                  verifyImageCanLoad(displayThumbnailUrl),
                ]);
              } catch (verificationError) {
                await supabase.storage
                  .from(PHOTO_BUCKET)
                  .remove([filePath, thumbnailPath]);
                throw verificationError;
              }

              const { data: savedPhoto, error: photoUpdateError } =
                await supabase
                  .from("photos")
                  .update({
                    file_path: filePath,
                    public_url: fullPublicData.publicUrl,
                    thumbnail_path: thumbnailPath,
                    thumbnail_url: thumbPublicData.publicUrl,
                    mime_type: "image/jpeg",
                    is_video: false,
                  })
                  .eq("id", photoId)
                  .eq("inspection_id", inspectionId)
                  .select("*")
                  .single();

              if (photoUpdateError || !savedPhoto?.id) {
                await supabase.storage
                  .from(PHOTO_BUCKET)
                  .remove([filePath, thumbnailPath]);

                throw new Error(
                  photoUpdateError?.message ||
                    "The marked-up photo could not be attached to the finding.",
                );
              }

              // Save editable annotation data as a secondary record. The
              // flattened image above is the report-visible source of truth.
              const { error: annotationError } = await supabase
                .from("photo_annotations")
                .insert({
                  inspection_id: Number(inspectionId),
                  finding_id: finding.id,
                  photo_id: photoId,
                  image_url: fullPublicData.publicUrl,
                  annotation_json: items,
                });

              if (annotationError) {
                console.warn(
                  "Marked image saved, but annotation JSON was not saved:",
                  annotationError,
                );
              }

              setLocalFinding((current: any) => {
                const baseFinding = current || finding;
                const nextPhotos = (baseFinding.photos || []).map(
                  (photo: any) =>
                    String(photo.id) === photoId
                      ? {
                          ...photo,
                          ...savedPhoto,
                          // One source of truth for the marked-up image.
                          signed_url: displayFullUrl,
                          signedUrl: displayFullUrl,
                          public_url: fullPublicData.publicUrl,
                          publicUrl: fullPublicData.publicUrl,
                          signed_thumbnail_url: displayThumbnailUrl,
                          signedThumbnailUrl: displayThumbnailUrl,
                          thumbnail_url: thumbPublicData.publicUrl,
                          thumbnailUrl: thumbPublicData.publicUrl,
                          file_path: filePath,
                          thumbnail_path: thumbnailPath,
                          mime_type: "image/jpeg",
                          is_video: false,
                          // Remove stale video aliases that previously caused
                          // the expanded viewer to open the original image.
                          signed_video_url: null,
                          signedVideoUrl: null,
                          video_url: null,
                          videoUrl: null,
                        }
                      : photo,
                );

                return {
                  ...baseFinding,
                  photos: nextPhotos,
                };
              });

              showMessage("success", "Marked-up photo saved to the report.");
              setShowMarkupEditor(false);
              setMarkupPhoto(null);

              document.body.style.removeProperty("overflow");
              document.documentElement.style.removeProperty("overflow");
              document.body.style.removeProperty("touch-action");
              document.documentElement.style.removeProperty("touch-action");
            }}
          />
        )}

        <div className="mb-4 w-full max-w-full overflow-x-hidden rounded-xl border border-purple-500/50 bg-purple-500/10 p-3 sm:p-4">
          <div>
            <h4 className="text-base font-black text-purple-300">
              🤖 AI Inspector Note
            </h4>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Add a correction for this existing finding. AI will adjust the actual observation, implication, recommendation, title, severity, or section only as needed.
            </p>
          </div>

          <textarea
            value={aiInspectorNote}
            onChange={(event) => setAiInspectorNote(event.target.value)}
            disabled={aiInspectorBusy}
            placeholder="Example: make this less aggressive and say further evaluation by a qualified contractor is recommended."
            className="mt-4 min-h-[90px] w-full rounded-xl border border-purple-500/40 bg-slate-950 px-4 py-3 text-white outline-none focus:border-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void runAiInspectorNoteRewrite();
            }}
            disabled={aiInspectorBusy || !aiInspectorNote.trim()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
          >
            {aiInspectorBusy && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {aiInspectorBusy ? "Adjusting Finding..." : "Run AI Inspector"}
          </button>
        </div>

        <div
          onClick={(event) => event.stopPropagation()}
          className="mb-4 w-full max-w-full overflow-x-hidden rounded-xl border border-slate-700 bg-slate-950/40 p-2 sm:p-4"
        >
          <EditableFinding
            key={`${String(displayFinding.id || finding.id)}-${String(
              displayFinding.updated_at || "",
            )}-${String(displayFinding.title || "")}-${String(
              displayFinding.observation || "",
            )}`}
            finding={displayFinding}
            availableSections={availableSections}
          />
        </div>

        {displayFinding.observation && (
          <ReportBlock title="Observation" text={displayFinding.observation} />
        )}

        {displayFinding.implication && (
          <ReportBlock title="Implication" text={displayFinding.implication} />
        )}

        {displayFinding.recommendation && (
          <ReportBlock title="Recommendation" text={displayFinding.recommendation} />
        )}

        {displayFinding.comment && (
          <ReportBlock
            title="Additional Notes"
            text={displayFinding.comment}
          />
        )}
      </div>
    </article>
  );
}

const FindingCard = memo(FindingCardBase);

function InlineStatusMessage({
  type,
  message,
}: {
  type: "success" | "error" | "";
  message: string;
}) {
  if (!message) return null;

  const isSuccess = type === "success";

  return (
    <div
      className={`rounded-xl border p-3 text-sm font-bold ${
        isSuccess
          ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
          : "border-red-500 bg-red-950/30 text-red-300"
      }`}
    >
      {message}
    </div>
  );
}

function ReportBlock({ title, text }: any) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-lg font-bold text-white">{title}</h4>

      <div className="w-full max-w-full overflow-x-hidden rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-200">
          {text}
        </p>
      </div>
    </div>
  );
}

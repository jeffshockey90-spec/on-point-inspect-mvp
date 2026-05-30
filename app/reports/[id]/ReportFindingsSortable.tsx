"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EditableFinding from "../../../components/EditableFinding";
import SectionLimitations from "../../../components/SectionLimitations";
import ReportDisclaimers from "../../../components/ReportDisclaimers";
import SectionInformationChecklist from "../../../components/SectionInformationChecklist";
import SectionReferencePhotos from "../../../components/SectionReferencePhotos";
import { supabase } from "../../../lib/supabaseClient";

export default function ReportFindingsSortable({ groupedFindings }: any) {
  const params = useParams();
  const router = useRouter();
  const inspectionId = String(params?.id || "");

  function getAllSectionsClosed(groups: any[]) {
    const next: Record<string, boolean> = {};

    (groups || []).forEach((group: any) => {
      next[group.section] = true;
    });

    return next;
  }

  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(
    () => getAllSectionsClosed(groupedFindings || [])
  );

  const [orderedGroups, setOrderedGroups] = useState<any[]>(groupedFindings || []);
  const [draggingSection, setDraggingSection] = useState<string | null>(null);

  useEffect(() => {
    const nextGroups = groupedFindings || [];

    setOrderedGroups(nextGroups);
    setClosedSections(getAllSectionsClosed(nextGroups));
  }, [groupedFindings]);

  const allFindings = useMemo(() => {
    return (orderedGroups || []).flatMap((group: any) => group.findings || []);
  }, [orderedGroups]);

  const allPhotos = useMemo(() => {
    const seen = new Set<string>();
    const photos: any[] = [];

    (allFindings || []).forEach((finding: any) => {
      (finding.photos || []).forEach((photo: any) => {
        const key = String(photo.id || photo.file_path || photo.public_url || photo.signed_url || "");
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
  }, [allFindings]);

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

  function moveSection(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= orderedGroups.length) return;

    setOrderedGroups((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
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

    setOrderedGroups((prev) => {
      const next = [...prev];

      const fromIndex = next.findIndex(
        (group: any) => group.section === draggingSection
      );

      const toIndex = next.findIndex(
        (group: any) => group.section === targetSection
      );

      if (fromIndex === -1 || toIndex === -1) return prev;

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return next;
    });

    setDraggingSection(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-700 bg-[#0f172a] p-4">
        <button
          type="button"
          onClick={expandAll}
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-teal-400"
        >
          Expand All
        </button>

        <button
          type="button"
          onClick={collapseAll}
          className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200 hover:bg-slate-800"
        >
          Collapse All
        </button>

        <div className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-400">
          Drag section headers to reorder
        </div>
      </div>

      {(orderedGroups || []).map((group: any, index: number) => {
        const findings = group.findings || [];
        const isClosed = !!closedSections[group.section];
        const isDragging = draggingSection === group.section;

        return (
          <section
            key={group.section}
            draggable
            onDragStart={() => handleDragStart(group.section)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(group.section)}
            onDragEnd={() => setDraggingSection(null)}
            className={`overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl transition ${
              isDragging ? "opacity-50 ring-2 ring-teal-400" : ""
            }`}
          >
            <div className="flex items-stretch border-b border-slate-700">
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
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className="cursor-grab select-none text-2xl text-slate-500 active:cursor-grabbing">
                    ⋮⋮
                  </span>

                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/50 bg-teal-500/10 text-2xl font-black text-teal-300">
                    {isClosed ? "+" : "−"}
                  </span>

                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold text-teal-400">
                      {group.section}
                    </h2>

                    <p className="mt-1 text-sm text-slate-400">
                      {findings.length} finding
                      {findings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200">
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
            </div>

            {!isClosed && (
              <div className="space-y-5 p-5">
                <SectionInformationChecklist
                  inspectionId={inspectionId}
                  section={group.section}
                />

                {group.section === "Inspection Details" && (
                  <ReportDisclaimers inspectionId={inspectionId} />
                )}

                <SectionLimitations
                  inspectionId={inspectionId}
                  section={group.section}
                />

                <SectionReferencePhotos
                  inspectionId={inspectionId}
                  section={group.section}
                />

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
                    router={router}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
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
  return (
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    photo?.url ||
    ""
  );
}

function isVideoMedia(photo: any) {
  const url = String(getPhotoUrl(photo) || "").toLowerCase();
  const path = String(photo?.file_path || photo?.storage_path || photo?.photo_path || "").toLowerCase();
  const type = String(photo?.mime_type || photo?.media_type || photo?.content_type || "").toLowerCase();

  return (
    type.startsWith("video/") ||
    path.match(/\.(mp4|mov|m4v|webm|avi)$/) !== null ||
    url.match(/\.(mp4|mov|m4v|webm|avi)(\?|$)/) !== null
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

    if (!url || hasSeenPhoto(seen, photo)) return;

    markPhotoSeen(seen, photo);
    photos.push(photo);
  });

  const legacyImage =
    finding.signed_image_url ||
    finding.image_url ||
    finding.public_image_url ||
    "";

  const legacyPhoto = {
    id: `legacy-${finding.id}`,
    signed_url: legacyImage,
    public_url: legacyImage,
    image_url: legacyImage,
    isLegacyImage: true,
  };

  if (legacyImage && !hasSeenPhoto(seen, legacyPhoto)) {
    photos.unshift(legacyPhoto);
  }

  return photos;
}

function FindingCard({ finding, inspectionId, allPhotos, router }: any) {
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [movingPhotoId, setMovingPhotoId] = useState<string | null>(null);
  const photos = getFindingPhotos(finding);

  async function movePhotoToFinding(photo: any) {
    if (!photo?.id || photo.isLegacyImage) {
      alert("This older image does not have a movable photo record.");
      return;
    }

    if (String(photo.finding_id || photo.current_finding_id || "") === String(finding.id)) {
      alert("This photo is already attached to this finding.");
      return;
    }

    const confirmed = window.confirm(
      "Move this photo to this finding? It will no longer appear under the previous finding."
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
      router.refresh();
    } catch (error: any) {
      alert(error?.message || "Failed to move photo.");
    } finally {
      setMovingPhotoId(null);
    }
  }

  async function deletePhotoFromFinding(photo: any) {
    if (!photo?.id || photo.isLegacyImage) {
      alert(
        "This older image is stored directly on the finding. Edit the finding image field or delete the finding to remove it."
      );
      return;
    }

    const confirmed = window.confirm(
      "Delete this photo from the report? This removes the photo record from this finding. The original storage file is left alone for safety."
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

      router.refresh();
    } catch (error: any) {
      alert(error?.message || "Failed to delete photo.");
    } finally {
      setMovingPhotoId(null);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl">
      {photos.length > 0 && (
        <div className="border-b border-slate-700 bg-black p-3">
          <div
            className={
              photos.length === 1
                ? "grid gap-3"
                : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            {photos.map((photo: any, index: number) => {
              const url = getPhotoUrl(photo);
              const isBusy = movingPhotoId === String(photo.id);

              return (
                <div
                  key={String(photo.id || photo.file_path || url || index)}
                  className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
                >
                  <a href={url} target="_blank" rel="noreferrer" className="block">
                    {isVideoMedia(photo) ? (
                      <video
                        src={url}
                        controls
                        className={
                          photos.length === 1
                            ? "max-h-[650px] w-full bg-black object-contain"
                            : "h-56 w-full bg-black object-contain"
                        }
                      />
                    ) : (
                      <img
                        src={url}
                        alt={`Finding photo ${index + 1}`}
                        className={
                          photos.length === 1
                            ? "max-h-[650px] w-full object-contain"
                            : "h-56 w-full object-contain transition hover:scale-[1.02]"
                        }
                      />
                    )}
                  </a>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs font-bold text-slate-400">
                    <span>Photo {index + 1}</span>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-600 px-3 py-1 text-slate-200 hover:bg-slate-800"
                      >
                        Open
                      </a>

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
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${getSeverityStyle(
              finding.severity
            )}`}
          >
            {finding.severity || "Recommended Repair"}
          </span>

          {finding.section && (
            <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">
              {finding.section}
            </span>
          )}

          {photos.length > 0 && (
            <span className="rounded-full border border-cyan-600 bg-cyan-950/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-300">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <h3 className="mb-4 text-2xl font-black text-white">
          {finding.title ||
            finding.finding_title ||
            finding.defect_title ||
            finding.name ||
            "Untitled Finding"}
        </h3>

        <div className="mb-5 flex flex-wrap gap-2">
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
                      finding.title ||
                      finding.finding_title ||
                      finding.defect_title ||
                      finding.name ||
                      "Untitled Finding",
                    section: finding.section || "Inspection Details",
                    severity: finding.severity || "Recommended Repair",
                    observation: finding.observation || "",
                    implication: finding.implication || "",
                    recommendation: finding.recommendation || "",
                  }),
                });

                let data: any = {};

                try {
                  data = await res.json();
                } catch {
                  data = {};
                }

                if (!res.ok) {
                  alert(data.error || "Failed to save template.");
                  return;
                }

                alert("Template saved!");
              } catch {
                alert("Failed to save template.");
              }
            }}
            className="rounded-xl border border-yellow-500 px-4 py-2 text-sm font-black text-yellow-300 hover:bg-yellow-500/10"
          >
            ⭐ Save as Template
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowPhotoPicker((prev) => !prev);
            }}
            className="rounded-xl border border-cyan-500 px-4 py-2 text-sm font-black text-cyan-300 hover:bg-cyan-500/10"
          >
            📎 Add Existing Photo
          </button>
        </div>

        {showPhotoPicker && (
          <div className="mb-5 rounded-xl border border-cyan-700 bg-cyan-950/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-black text-cyan-300">
                  Add Existing Photo To This Finding
                </h4>
                <p className="mt-1 text-sm text-slate-300">
                  Select a photo from this report. It will be moved from its current finding to this one.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPhotoPicker(false)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {allPhotos.length === 0 ? (
              <p className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-400">
                No movable photo records were found in this report yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {allPhotos.map((photo: any, index: number) => {
                  const url = getPhotoUrl(photo);
                  const alreadyAttached =
                    String(photo.finding_id || photo.current_finding_id || "") ===
                    String(finding.id);

                  return (
                    <div
                      key={String(photo.id || photo.file_path || index)}
                      className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
                    >
                      {url ? (
                        isVideoMedia(photo) ? (
                          <video
                            src={url}
                            controls
                            className="h-36 w-full bg-black object-contain"
                          />
                        ) : (
                          <img
                            src={url}
                            alt={`Report photo ${index + 1}`}
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
                          {photo.current_section} · {photo.current_finding_title}
                        </p>

                        <button
                          type="button"
                          onClick={() => movePhotoToFinding(photo)}
                          disabled={alreadyAttached || movingPhotoId === String(photo.id)}
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
            )}
          </div>
        )}

        <div
          onClick={(event) => event.stopPropagation()}
          className="mb-5 rounded-xl border border-slate-700 bg-slate-950/40 p-4"
        >
          <EditableFinding finding={finding} />
        </div>

        {finding.observation && (
          <ReportBlock title="Observation" text={finding.observation} />
        )}

        {finding.implication && (
          <ReportBlock title="Implication" text={finding.implication} />
        )}

        {finding.recommendation && (
          <ReportBlock title="Recommendation" text={finding.recommendation} />
        )}

        {finding.comment && (
          <ReportBlock title="Additional Notes" text={finding.comment} />
        )}
      </div>
    </article>
  );
}

function ReportBlock({ title, text }: any) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-lg font-bold text-white">{title}</h4>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="whitespace-pre-line text-sm leading-7 text-slate-200">
          {text}
        </p>
      </div>
    </div>
  );
}

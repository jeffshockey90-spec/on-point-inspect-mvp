"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SECTIONS = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

function photoIsVideo(photo: any) {
  const mime = String(photo?.mime_type || photo?.content_type || "").toLowerCase();
  return Boolean(photo?.is_video) || mime.startsWith("video/");
}

function photoThumbUrl(photo: any) {
  return (
    photo?.signed_thumbnail_url ||
    photo?.signedThumbnailUrl ||
    photo?.signed_url ||
    photo?.signedUrl ||
    photo?.public_url ||
    photo?.publicUrl ||
    photo?.url ||
    ""
  );
}

function photoFullUrl(photo: any) {
  return (
    photo?.signed_url ||
    photo?.signedUrl ||
    photo?.public_url ||
    photo?.publicUrl ||
    photo?.url ||
    ""
  );
}

export default function FieldReviewQueue({
  inspectionId,
  reviewFindings,
  availableSections,
}: {
  inspectionId: string;
  reviewFindings: any[];
  availableSections?: string[];
}) {
  const router = useRouter();

  // Local working copy so we can optimistically drop approved cards without
  // waiting for a full server refresh. Re-seeded whenever the server props change.
  const [items, setItems] = useState<any[]>(reviewFindings || []);
  const [open, setOpen] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(reviewFindings || []);
  }, [reviewFindings]);

  const sectionOptions = useMemo(() => {
    return Array.from(
      new Set(
        [...SECTIONS, ...(availableSections || [])].filter((value) =>
          Boolean(value),
        ),
      ),
    );
  }, [availableSections]);

  const count = items.length;

  if (count === 0) return null;

  async function approveAll() {
    if (approvingAll) return;
    setApprovingAll(true);
    setError("");

    const previous = items;
    setItems([]); // optimistic

    try {
      const response = await fetch("/api/findings/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, approveAll: true }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setItems(previous); // rollback
        setError(data?.error || "Failed to approve all findings.");
        return;
      }

      router.refresh();
    } catch (err: any) {
      setItems(previous);
      setError(err?.message || "Failed to approve all findings.");
    } finally {
      setApprovingAll(false);
    }
  }

  function handleApproved(findingId: string) {
    setItems((current) =>
      current.filter((finding) => String(finding.id) !== String(findingId)),
    );
    router.refresh();
  }

  function handleRepolished(findingId: string, updated: any) {
    setItems((current) =>
      current.map((finding) =>
        String(finding.id) === String(findingId)
          ? { ...finding, ...updated }
          : finding,
      ),
    );
    router.refresh();
  }

  return (
    <section
      id="field-review-queue"
      className="mb-4 w-full max-w-full overflow-hidden rounded-2xl border border-amber-500/50 bg-[var(--fl-surface-2)] shadow-lg"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-amber-500/5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/60 bg-amber-500/15 text-xl">
            🕑
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--fl-warn-text)]">
              Offline Sync
            </p>
            <h2 className="text-base font-semibold text-[var(--fl-warn-text)] sm:text-lg">
              Field Review · {count} finding{count === 1 ? "" : "s"} to approve
            </h2>
            <p className="mt-0.5 text-xs font-bold text-[var(--fl-warn-text)]">
              Verify the section and severity, then approve — or edit the note
              and re-polish.
            </p>
          </div>
        </div>

        <span className="rounded-xl border border-amber-400/50 px-4 py-2 text-xs font-semibold text-[var(--fl-warn-text)]">
          {open ? "Hide" : "Show"}
        </span>
      </div>

      {open && (
        <div className="space-y-4 border-t border-amber-500/30 p-3 sm:p-4">
          {error && (
            <div className="rounded-xl border border-red-500/60 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-[var(--fl-warn-text)]">
              These were captured in the field and polished by AI after syncing.
            </p>
            <button
              type="button"
              onClick={approveAll}
              disabled={approvingAll}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {approvingAll && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {approvingAll ? "Approving..." : `Approve All (${count})`}
            </button>
          </div>

          {items.map((finding) => (
            <ReviewCard
              key={finding.id}
              inspectionId={inspectionId}
              finding={finding}
              sectionOptions={sectionOptions}
              onApproved={handleApproved}
              onRepolished={handleRepolished}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewCard({
  inspectionId,
  finding,
  sectionOptions,
  onApproved,
  onRepolished,
}: {
  inspectionId: string;
  finding: any;
  sectionOptions: string[];
  onApproved: (findingId: string) => void;
  onRepolished: (findingId: string, updated: any) => void;
}) {
  const options = useMemo(() => {
    if (finding.section && !sectionOptions.includes(finding.section)) {
      return [...sectionOptions, finding.section];
    }
    return sectionOptions;
  }, [sectionOptions, finding.section]);

  const [section, setSection] = useState(finding.section || "Exterior");
  const [severity, setSeverity] = useState(finding.severity || "Recommended Repair");
  const [approving, setApproving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(finding.observation || finding.title || "");
  const [repolishing, setRepolishing] = useState(false);
  const [error, setError] = useState("");

  // Keep local write-up in sync after a re-polish updates the finding.
  const observation = finding.observation || "";
  const implication = finding.implication || "";
  const recommendation = finding.recommendation || "";

  const photos = Array.isArray(finding.photos) ? finding.photos : [];

  async function approve() {
    if (approving) return;
    setApproving(true);
    setError("");

    try {
      const response = await fetch("/api/findings/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          findingId: finding.id,
          section,
          severity,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Failed to approve finding.");
        setApproving(false);
        return;
      }

      onApproved(String(finding.id));
    } catch (err: any) {
      setError(err?.message || "Failed to approve finding.");
      setApproving(false);
    }
  }

  async function repolish() {
    if (repolishing) return;

    const cleanNote = note.trim();
    if (!cleanNote) {
      setError("Add a note for the AI to re-polish.");
      return;
    }

    setRepolishing(true);
    setError("");

    try {
      const response = await fetch("/api/findings/repolish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          findingId: finding.id,
          note: cleanNote,
          section,
          severity,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.finding) {
        setError(data?.error || "AI re-polish failed.");
        setRepolishing(false);
        return;
      }

      const updated = data.finding;
      if (updated.section) setSection(updated.section);
      if (updated.severity) setSeverity(updated.severity);
      setNoteOpen(false);
      onRepolished(String(finding.id), updated);
    } catch (err: any) {
      setError(err?.message || "AI re-polish failed.");
    } finally {
      setRepolishing(false);
    }
  }

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold text-[var(--fl-info-text)]">
          {finding.title || "Offline Field Note"}
        </h3>
        <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-[var(--fl-warn-text)]">
          Needs review
        </span>
      </div>

      {photos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {photos.slice(0, 6).map((photo: any, index: number) => {
            const url = photoThumbUrl(photo);
            if (!url) return null;

            if (photoIsVideo(photo)) {
              return (
                <a
                  key={photo.id || index}
                  href={photoFullUrl(photo)}
                  target="_blank"
                  rel="noreferrer"
                  className="relative flex h-20 w-20 items-center justify-center rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-xs font-semibold text-[var(--fl-text)]"
                >
                  ▶ Video
                </a>
              );
            }

            return (
              <a
                key={photo.id || index}
                href={photoFullUrl(photo)}
                target="_blank"
                rel="noreferrer"
                className="block h-20 w-20 overflow-hidden rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Field photo"
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              </a>
            );
          })}
        </div>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Section
          </p>
          <select
            value={section}
            onChange={(event) => setSection(event.target.value)}
            disabled={approving || repolishing}
            className="min-h-[44px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-cyan-400 disabled:opacity-60"
          >
            {options.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Severity
          </p>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            disabled={approving || repolishing}
            className="min-h-[44px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-cyan-400 disabled:opacity-60"
          >
            {SEVERITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 space-y-2 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3">
        <WriteUpRow label="Observation" value={observation} />
        <WriteUpRow label="Implication" value={implication} />
        <WriteUpRow label="Recommendation" value={recommendation} />
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/60 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
          {error}
        </div>
      )}

      {noteOpen && (
        <div className="mb-3 rounded-xl border border-purple-500/50 bg-purple-500/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-purple-text)]">
            Field note to re-polish
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={repolishing}
            rows={4}
            placeholder="Rewrite the raw field note. AI will regenerate the write-up."
            className="min-h-[96px] w-full rounded-xl border border-purple-500/40 bg-[var(--fl-ground)] px-3 py-2 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-purple-300 disabled:opacity-60"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={approving || repolishing}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {approving && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {approving ? "Approving..." : "Approve"}
        </button>

        {!noteOpen ? (
          <button
            type="button"
            onClick={() => {
              setNote(finding.observation || finding.title || "");
              setNoteOpen(true);
            }}
            disabled={approving || repolishing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500 bg-purple-500/10 px-5 py-3 text-sm font-semibold text-[var(--fl-purple-text)] transition active:scale-[0.98] hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
          >
            Edit note & re-polish
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={repolish}
              disabled={repolishing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {repolishing && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {repolishing ? "Re-polishing..." : "Re-polish with AI"}
            </button>

            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              disabled={repolishing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--fl-line)] px-5 py-3 text-sm font-semibold text-[var(--fl-text)] transition active:scale-[0.98] hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function WriteUpRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-[var(--fl-text)]">
        {value}
      </p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshKeepScroll } from "../lib/refreshKeepScroll";

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

function firstPhotoUrl(photos: any[]): string {
  const p = (photos || [])[0] || {};
  return (
    p.signed_thumbnail_url ||
    p.signedThumbnailUrl ||
    p.thumbnail_url ||
    p.signed_url ||
    p.signedUrl ||
    p.photo_url ||
    p.public_url ||
    ""
  );
}

// Field Review queue for async-drafted LIMITATIONS and EQUIPMENT — the sibling
// of FieldReviewQueue (findings). Items stay out of the report + every client
// copy until approved here. Approve keeps the item (clears needs_review); the
// inspector edits it afterward in the normal editor.
export default function LimitationEquipmentReview({
  inspectionId,
  availableSections,
}: {
  inspectionId: string;
  availableSections?: string[];
}) {
  const router = useRouter();
  const [limitations, setLimitations] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [limPhotos, setLimPhotos] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string>("");
  const [approvingAll, setApprovingAll] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!inspectionId) return;
    try {
      const res = await fetch(
        `/api/field-review/pending?inspectionId=${encodeURIComponent(inspectionId)}`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const lims = Array.isArray(data.limitations) ? data.limitations : [];
      const eqs = Array.isArray(data.equipment) ? data.equipment : [];
      setLimitations(lims);
      setEquipment(eqs);

      const ids = lims.map((l: any) => l.id).filter(Boolean);
      if (ids.length) {
        const photos = await fetch("/api/limitation-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ limitationIds: ids }),
        })
          .then((r) => (r.ok ? r.json() : { photos: [] }))
          .catch(() => ({ photos: [] }));
        const grouped: Record<string, any[]> = {};
        (Array.isArray(photos.photos) ? photos.photos : []).forEach((p: any) => {
          if (!p?.limitation_id) return;
          (grouped[p.limitation_id] ||= []).push(p);
        });
        setLimPhotos(grouped);
      } else {
        setLimPhotos({});
      }
    } catch {
      /* ignore — the panel just stays empty */
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
    function onChange() {
      void load();
    }
    window.addEventListener("opi:inspection-data-changed", onChange);
    window.addEventListener("opi:draft-queue-changed", onChange);
    return () => {
      window.removeEventListener("opi:inspection-data-changed", onChange);
      window.removeEventListener("opi:draft-queue-changed", onChange);
    };
  }, [load]);

  const sectionOptions = useMemo(
    () =>
      Array.from(
        new Set([...SECTIONS, ...(availableSections || [])].filter(Boolean)),
      ),
    [availableSections],
  );

  const count = limitations.length + equipment.length;
  if (count === 0) return null;

  async function approveLimitation(id: string, section?: string) {
    if (busyId) return;
    setBusyId(`lim:${id}`);
    setError("");
    try {
      const res = await fetch("/api/limitations/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, limitationId: id, section }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not approve that limitation.");
        return;
      }
      setLimitations((cur) => cur.filter((l) => String(l.id) !== String(id)));
      refreshKeepScroll(router);
    } catch (err: any) {
      setError(err?.message || "Could not approve that limitation.");
    } finally {
      setBusyId("");
    }
  }

  async function approveEquipment(id: string) {
    if (busyId) return;
    setBusyId(`eq:${id}`);
    setError("");
    try {
      const res = await fetch("/api/equipment/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, equipmentId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not approve that equipment.");
        return;
      }
      setEquipment((cur) => cur.filter((e) => String(e.id) !== String(id)));
      refreshKeepScroll(router);
    } catch (err: any) {
      setError(err?.message || "Could not approve that equipment.");
    } finally {
      setBusyId("");
    }
  }

  async function approveAll() {
    if (approvingAll) return;
    setApprovingAll(true);
    setError("");
    const prevLims = limitations;
    const prevEqs = equipment;
    setLimitations([]);
    setEquipment([]);
    try {
      const calls: Promise<Response>[] = [];
      if (prevLims.length) {
        calls.push(
          fetch("/api/limitations/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inspectionId, approveAll: true }),
          }),
        );
      }
      if (prevEqs.length) {
        calls.push(
          fetch("/api/equipment/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inspectionId, approveAll: true }),
          }),
        );
      }
      const responses = await Promise.all(calls);
      if (responses.some((r) => !r.ok)) {
        setLimitations(prevLims);
        setEquipment(prevEqs);
        setError("Some items couldn't be approved — try again.");
        return;
      }
      refreshKeepScroll(router);
    } catch (err: any) {
      setLimitations(prevLims);
      setEquipment(prevEqs);
      setError(err?.message || "Could not approve all.");
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <section
      id="field-review-extras"
      className="mb-4 w-full max-w-full overflow-hidden rounded-2xl border border-amber-500/50 bg-[var(--fl-surface-2)] shadow-lg"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-amber-500/5 [touch-action:manipulation]"
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
              Field Review · {count} item{count === 1 ? "" : "s"} to approve
            </h2>
            <p className="mt-0.5 text-xs font-bold text-[var(--fl-warn-text)]">
              {limitations.length > 0 && `${limitations.length} limitation${limitations.length === 1 ? "" : "s"}`}
              {limitations.length > 0 && equipment.length > 0 && " · "}
              {equipment.length > 0 && `${equipment.length} equipment`}
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
              AI-drafted in the field and waiting for your approval. They stay out
              of the report and any client copy until you approve them.
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

          {limitations.map((lim) => (
            <LimitationReviewCard
              key={`lim-${lim.id}`}
              lim={lim}
              photoUrl={firstPhotoUrl(limPhotos[lim.id] || [])}
              sectionOptions={sectionOptions}
              busy={busyId === `lim:${lim.id}`}
              onApprove={approveLimitation}
            />
          ))}

          {equipment.map((eq) => (
            <EquipmentReviewCard
              key={`eq-${eq.id}`}
              eq={eq}
              busy={busyId === `eq:${eq.id}`}
              onApprove={approveEquipment}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LimitationReviewCard({
  lim,
  photoUrl,
  sectionOptions,
  busy,
  onApprove,
}: {
  lim: any;
  photoUrl: string;
  sectionOptions: string[];
  busy: boolean;
  onApprove: (id: string, section?: string) => void;
}) {
  const [section, setSection] = useState<string>(lim.section || "Exterior");
  const body = String(lim.limitation_comment || lim.ai_notes || lim.custom_text || "").trim();

  return (
    <div className="rounded-xl border border-amber-500/30 bg-[var(--fl-surface-1)] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--fl-warn-text)]">
            Limitation
          </p>
          <p className="truncate text-sm font-semibold text-[var(--fl-text-1)]">
            {lim.label || "Inspection Limitation"}
          </p>
          {body && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--fl-text-2)]">{body}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-xs font-semibold text-[var(--fl-text-2)]">
          Section
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="ml-2 rounded-lg border border-white/15 bg-[var(--fl-surface-2)] px-2 py-1.5 text-xs text-[var(--fl-text-1)] [touch-action:manipulation]"
          >
            {sectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onApprove(String(lim.id), section)}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white transition active:scale-[0.98] hover:bg-emerald-400 disabled:opacity-60 [touch-action:manipulation] sm:ml-auto"
        >
          {busy && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {busy ? "Approving..." : "Approve"}
        </button>
      </div>
    </div>
  );
}

function EquipmentReviewCard({
  eq,
  busy,
  onApprove,
}: {
  eq: any;
  busy: boolean;
  onApprove: (id: string) => void;
}) {
  const title = [eq.manufacturer, eq.equipment_type].filter(Boolean).join(" ").trim() || "Equipment";
  const meta = [
    eq.model ? `Model ${eq.model}` : "",
    eq.manufacture_year ? `${eq.manufacture_year}` : "",
    eq.condition || "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-xl border border-amber-500/30 bg-[var(--fl-surface-1)] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {eq.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={eq.image_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--fl-warn-text)]">
            Equipment
          </p>
          <p className="truncate text-sm font-semibold text-[var(--fl-text-1)]">{title}</p>
          {meta && <p className="mt-1 text-xs text-[var(--fl-text-2)]">{meta}</p>}
          {eq.inspector_note && (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-[var(--fl-text-2)]">
              {eq.inspector_note}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onApprove(String(eq.id))}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white transition active:scale-[0.98] hover:bg-emerald-400 disabled:opacity-60 [touch-action:manipulation]"
        >
          {busy && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {busy ? "Approving..." : "Approve"}
        </button>
      </div>
    </div>
  );
}

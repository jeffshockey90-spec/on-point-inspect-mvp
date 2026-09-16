"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type Photo = {
  id: string;
  public_url: string | null;
  file_path: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  is_video: boolean | null;
};

type Item = {
  finding: {
    id: number;
    title: string | null;
    section: string | null;
    severity: string | null;
    reinspection_status: string | null;
    reinspection_note: string | null;
    reinspection_summary: string | null;
  };
  original: { observation: string | null; recommendation: string | null } | null;
  beforePhotos: Photo[];
  afterPhotos: Photo[];
};

const STATUSES: { key: string; label: string; on: string }[] = [
  { key: "corrected", label: "Corrected", on: "border-emerald-400 bg-emerald-500/20 text-[var(--fl-good-text)]" },
  { key: "not_corrected", label: "Not corrected", on: "border-red-400 bg-red-500/20 text-[var(--fl-crit-text)]" },
  { key: "not_evaluated", label: "Not evaluated", on: "border-slate-400 bg-slate-500/20 text-[var(--fl-text)]" },
];

function src(photo: Photo) {
  return photo.thumbnail_url || photo.public_url || "";
}

/**
 * Shown on a re-inspection report.
 *
 * Left of each row is the BEFORE state read from the original finding — its
 * narrative and its photos, displayed read-only. Nothing in here writes to the
 * original: verdicts, notes, drafted summaries and after photos all go to the
 * re-inspection's own rows through /api/inspections/reinspection, which refuses
 * an original finding id outright.
 */
export default function ReinspectionChecklist({ inspectionId }: { inspectionId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  // Creating a re-inspection makes a real report the moment the button is
  // tapped, so a mis-tap leaves one sitting in the inspector's list. This
  // discards it -- and only it: the endpoint is scoped to the re-inspection's
  // own rows and refuses an original outright.
  async function discard() {
    if (
      !confirm(
        "Discard this re-inspection? It deletes this re-inspection and its photos only. The original report is not affected.",
      )
    ) {
      return;
    }
    setDiscarding(true);
    setError("");
    try {
      const res = await fetch("/api/inspections/reinspection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: Number(inspectionId) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not discard that.");
      }
      window.location.href = "/reports";
    } catch (e: any) {
      setError(e?.message || "Could not discard that.");
      setDiscarding(false);
    }
  }

  async function load() {
    try {
      const res = await fetch(`/api/inspections/reinspection?inspectionId=${inspectionId}`, {
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : null;
      setItems(data?.items || []);
    } catch {
      /* leave the list as-is */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  function patchLocal(findingId: number, changes: Partial<Item["finding"]>) {
    setItems((prev) =>
      prev.map((it) =>
        it.finding.id === findingId ? { ...it, finding: { ...it.finding, ...changes } } : it,
      ),
    );
  }

  async function save(findingId: number, body: Record<string, any>) {
    setError("");
    const res = await fetch("/api/inspections/reinspection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingId, ...body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // 409 is the immutability guard: the id belonged to the original report.
      setError(data?.error || "Could not save that.");
    }
    return res.ok;
  }

  async function setStatus(findingId: number, status: string) {
    setBusy(findingId);
    patchLocal(findingId, { reinspection_status: status });
    try {
      await save(findingId, { status });
    } finally {
      setBusy(null);
    }
  }

  async function draftWithAI(item: Item) {
    const note = String(item.finding.reinspection_note || "").trim();
    if (!note) {
      setError("Add a note about what you saw on the return visit first.");
      return;
    }
    setDrafting(item.finding.id);
    setError("");
    try {
      const res = await fetch("/api/ai/reinspection-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId: item.finding.id,
          note,
          status: item.finding.reinspection_status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.summary) {
        setError(data?.error || "Could not draft that.");
        return;
      }
      // The AI route only returns text. Saving is this separate guarded call.
      patchLocal(item.finding.id, { reinspection_summary: data.summary });
      await save(item.finding.id, { summary: data.summary, note });
    } finally {
      setDrafting(null);
    }
  }

  async function addAfterPhoto(findingId: number, file: File) {
    setBusy(findingId);
    setError("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `reinspection/${inspectionId}/${findingId}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(path, file);
      if (uploadError) throw new Error(uploadError.message);

      const { data: pub } = supabase.storage.from("inspection-photos").getPublicUrl(path);

      const res = await fetch("/api/inspections/reinspection/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId,
          public_url: pub.publicUrl,
          file_path: path,
          is_video: file.type.startsWith("video/"),
          mime_type: file.type || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not attach that photo.");
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  const counts = {
    corrected: items.filter((i) => i.finding.reinspection_status === "corrected").length,
    not_corrected: items.filter((i) => i.finding.reinspection_status === "not_corrected").length,
    pending: items.filter(
      (i) =>
        i.finding.reinspection_status !== "corrected" &&
        i.finding.reinspection_status !== "not_corrected",
    ).length,
  };

  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 shadow-xl">
      <div className="flex items-center gap-3">
        <RotateCcw className="h-6 w-6 text-[var(--fl-warn-text)]" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-warn-text)]">
            Limited Repair Re-Inspection
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">Verify Prior Findings</h2>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            {counts.corrected} corrected · {counts.not_corrected} not corrected · {counts.pending} to
            review. The original report is not changed by anything on this page.
          </p>
        </div>

        <button
          type="button"
          onClick={discard}
          disabled={discarding}
          className="ml-auto inline-flex items-center gap-1.5 self-start rounded-lg border border-[var(--fl-line)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--fl-muted)] transition hover:border-red-400 hover:text-[var(--fl-crit-text)] disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {discarding ? "Discarding…" : "Discard"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-[var(--fl-crit-text)]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-5 text-sm text-[var(--fl-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--fl-muted)]">No findings carried over.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const f = item.finding;
            return (
              <div
                key={f.id}
                className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--fl-text)]">{f.title || "Finding"}</p>
                    <p className="text-xs text-[var(--fl-muted)]">
                      {f.section || "General"}
                      {f.severity ? ` · ${f.severity}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => {
                      const active = f.reinspection_status === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setStatus(f.id, s.key)}
                          disabled={busy === f.id}
                          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                            active
                              ? s.on
                              : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {item.original?.observation ? (
                  <p className="mt-3 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface)] p-2.5 text-xs text-[var(--fl-muted)]">
                    <span className="font-semibold uppercase tracking-wide">Originally reported</span>
                    <br />
                    {item.original.observation}
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                      Before
                    </p>
                    {item.beforePhotos.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {item.beforePhotos.map((p) => (
                          <img
                            key={p.id}
                            src={src(p)}
                            alt={p.caption || "Original condition"}
                            className="h-20 w-20 rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--fl-muted)]">No original photo.</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                      After
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.afterPhotos.map((p) => (
                        <img
                          key={p.id}
                          src={src(p)}
                          alt={p.caption || "Re-inspection photo"}
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputs.current[f.id]?.click()}
                        disabled={busy === f.id}
                        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--fl-line)] text-[10px] font-semibold text-[var(--fl-muted)] transition hover:text-[var(--fl-text)] disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4" />
                        Add
                      </button>
                      <input
                        ref={(el) => {
                          fileInputs.current[f.id] = el;
                        }}
                        type="file"
                        accept="image/*,video/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) addAfterPhoto(f.id, file);
                        }}
                      />
                    </div>
                  </div>
                </div>

                <textarea
                  value={f.reinspection_note || ""}
                  onChange={(e) => patchLocal(f.id, { reinspection_note: e.target.value })}
                  onBlur={(e) => save(f.id, { note: e.target.value })}
                  placeholder="What did you see on the return visit?"
                  rows={2}
                  className="mt-3 w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface)] p-2.5 text-sm text-[var(--fl-text)] placeholder:text-[var(--fl-muted)]"
                />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => draftWithAI(item)}
                    disabled={drafting === f.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fl-line)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--fl-text)] transition hover:border-cyan-400 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {drafting === f.id ? "Drafting…" : "Draft re-inspection note"}
                  </button>
                </div>

                {f.reinspection_summary ? (
                  <textarea
                    value={f.reinspection_summary}
                    onChange={(e) => patchLocal(f.id, { reinspection_summary: e.target.value })}
                    onBlur={(e) => save(f.id, { summary: e.target.value })}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-cyan-400/40 bg-[var(--fl-surface)] p-2.5 text-sm text-[var(--fl-text)]"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

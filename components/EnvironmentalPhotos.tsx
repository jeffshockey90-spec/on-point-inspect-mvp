"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadEnvironmentalPhotos,
  uploadEnvironmentalPhoto,
  updateEnvironmentalPhotoCaption,
  deleteEnvironmentalPhoto,
  type EnvironmentalPhotoKind,
  type EnvironmentalPhotoRow,
} from "../lib/environmentalPhotos";

// Inspector-facing photo gallery for an environmental panel (Mold now). Upload,
// caption, and remove photos that render on the client environmental report.
export default function EnvironmentalPhotos({
  inspectionId,
  kind = "mold",
  title = "Mold Photos",
}: {
  inspectionId: string;
  kind?: EnvironmentalPhotoKind;
  title?: string;
}) {
  const [photos, setPhotos] = useState<EnvironmentalPhotoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const rows = await loadEnvironmentalPhotos(inspectionId, kind);
      if (active) setPhotos(rows);
    })();
    return () => {
      active = false;
    };
  }, [inspectionId, kind]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const uploaded: EnvironmentalPhotoRow[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        // eslint-disable-next-line no-await-in-loop
        uploaded.push(await uploadEnvironmentalPhoto({ inspectionId, kind, file }));
      }
      setPhotos((cur) => [...cur, ...uploaded]);
    } catch (err: any) {
      setError(err?.message || "Couldn't upload that photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveCaption(id: string, caption: string) {
    setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, caption } : p)));
    try {
      await updateEnvironmentalPhotoCaption(id, caption);
    } catch {
      /* non-fatal; the next load reconciles */
    }
  }

  async function remove(row: EnvironmentalPhotoRow) {
    if (busy) return;
    setPhotos((cur) => cur.filter((p) => p.id !== row.id));
    try {
      await deleteEnvironmentalPhoto(row);
    } catch (err: any) {
      setError(err?.message || "Couldn't remove that photo.");
      // Reload to restore accurate state on failure.
      const rows = await loadEnvironmentalPhotos(inspectionId, kind);
      setPhotos(rows);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-[var(--fl-text)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            Photos here show on the client environmental report.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-purple-500 bg-purple-500/10 px-4 py-2.5 text-sm font-bold text-[var(--fl-purple-text)] transition active:scale-[0.98] hover:bg-purple-500 hover:text-slate-950 [touch-action:manipulation]">
          {busy ? "Uploading…" : "+ Add Photos"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>
      )}

      {photos.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--fl-muted)]">No photos yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {photos.map((p) => (
            <div
              key={p.id}
              className="overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-1)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.signed_thumbnail_url || p.signed_url || p.public_url || ""}
                alt={p.caption || "Mold photo"}
                className="h-36 w-full object-cover"
              />
              <div className="p-2">
                <input
                  type="text"
                  defaultValue={p.caption || ""}
                  placeholder="Caption (optional)"
                  onBlur={(e) => void saveCaption(p.id, e.target.value)}
                  className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-2 py-1.5 text-xs text-[var(--fl-text)] [touch-action:manipulation]"
                />
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  className="mt-2 w-full rounded-lg border border-red-500/50 px-2 py-1.5 text-xs font-semibold text-[var(--fl-crit-text)] transition active:scale-[0.98] hover:bg-red-500/10 [touch-action:manipulation]"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

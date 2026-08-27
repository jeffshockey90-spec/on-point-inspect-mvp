"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildVisionSnapshot,
  mergeVisionObjects,
  objectsFromMemoryEvents,
  readInspectorVisionHabits,
  readVisionSnapshot,
  writeVisionSnapshot,
  type VisionSnapshot,
} from "../lib/ai/visionPlatform";

type Props = {
  inspectionId: string;
  section: string;
  online: boolean;
};

function scoreTone(score: number) {
  if (score >= 92) return "border-emerald-400/50 bg-emerald-500/10 text-emerald-100";
  if (score >= 70) return "border-yellow-400/50 bg-yellow-500/10 text-yellow-100";
  return "border-cyan-400/40 bg-cyan-500/10 text-cyan-100";
}

export default function LiveVisionPlatformPanel({ inspectionId, section, online }: Props) {
  const [snapshot, setSnapshot] = useState<VisionSnapshot>(() => readVisionSnapshot(inspectionId));
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!inspectionId) return;
    const local = readVisionSnapshot(inspectionId);
    if (!online) {
      setSnapshot(local);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/ai/inspection-memory?inspectionId=${encodeURIComponent(inspectionId)}&limit=100`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const remoteObjects = objectsFromMemoryEvents(data?.events || []);
      const merged = mergeVisionObjects(local.objects, remoteObjects);
      const next = buildVisionSnapshot(inspectionId, merged, readInspectorVisionHabits());
      writeVisionSnapshot(next);
      setSnapshot(next);
    } catch {
      setSnapshot(local);
    } finally {
      setLoading(false);
    }
  }, [inspectionId, online]);

  useEffect(() => {
    setSnapshot(readVisionSnapshot(inspectionId));
    void refresh();

    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.inspectionId && String(detail.inspectionId) !== String(inspectionId)) return;
      setSnapshot(readVisionSnapshot(inspectionId));
      window.setTimeout(() => void refresh(), 200);
    };

    window.addEventListener("opi:vision-platform-updated", handle as EventListener);
    window.addEventListener("opi:findings-changed", handle as EventListener);
    window.addEventListener("opi:reference-photos-changed", handle as EventListener);
    return () => {
      window.removeEventListener("opi:vision-platform-updated", handle as EventListener);
      window.removeEventListener("opi:findings-changed", handle as EventListener);
      window.removeEventListener("opi:reference-photos-changed", handle as EventListener);
    };
  }, [inspectionId, refresh]);

  const current = useMemo(
    () => snapshot.sections.find((item) => item.section === section) || snapshot.sections[0],
    [snapshot, section],
  );
  const sectionObjects = useMemo(
    () => snapshot.objects.filter((item) => item.section === section).slice(0, 18),
    [snapshot, section],
  );
  const habitPrompts = useMemo(
    () => snapshot.habits.filter((habit) => habit.section === section && !sectionObjects.some((item) => item.category === habit.label)).slice(0, 4),
    [snapshot, section, sectionObjects],
  );

  return (
    <section className="space-y-3 rounded-2xl border border-violet-400/40 bg-violet-500/10 p-3 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">AI Vision Platform</p>
          <h3 className="mt-1 truncate text-lg font-semibold">{section}</h3>
          <p className="mt-1 text-xs leading-5 text-[#8a93a3]">Tracks what AI has seen, what has evidence, and where to inspect next.</p>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${scoreTone(current?.score || 0)}`}>
          {current?.score || 0}%
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-violet-400 transition-[width] duration-300" style={{ width: `${current?.score || 0}%` }} />
      </div>

      {current?.complete && (
        <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100">
          ✓ {section} has enough vision coverage to complete. Review the remaining item before moving on.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-emerald-400/30 bg-black/20 p-2">
          <p className="text-lg font-semibold text-emerald-200">{current?.covered.length || 0}</p>
          <p className="text-[10px] font-bold text-[#8a93a3]">Covered</p>
        </div>
        <div className="rounded-xl border border-yellow-400/30 bg-black/20 p-2">
          <p className="text-lg font-semibold text-yellow-200">{current?.missing.length || 0}</p>
          <p className="text-[10px] font-bold text-[#8a93a3]">Missing</p>
        </div>
        <div className="rounded-xl border border-cyan-400/30 bg-black/20 p-2">
          <p className="text-lg font-semibold text-cyan-200">{sectionObjects.length}</p>
          <p className="text-[10px] font-bold text-[#8a93a3]">Objects</p>
        </div>
      </div>

      {current?.missing.length ? (
        <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow-200">Still Missing</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {current.missing.slice(0, 8).map((item) => (
              <span key={item} className="rounded-full border border-yellow-300/30 bg-black/20 px-2.5 py-1 text-xs font-bold text-yellow-100">○ {item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {sectionObjects.length ? (
        <details open className="rounded-xl border border-[#232b38] bg-black/20 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#e8ecf3]">Digital Twin objects ({sectionObjects.length})</summary>
          <div className="mt-3 space-y-2">
            {sectionObjects.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.documented ? "✓" : "◉"} {item.label}</p>
                  <p className="text-[10px] text-[#8a93a3]">Seen {item.seenCount}× · {Math.round(item.confidence * 100)}% confidence</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${item.documented ? "bg-emerald-400 text-black" : "bg-cyan-400/15 text-cyan-200"}`}>
                  {item.documented ? `${item.photoCount} photo` : "tracked"}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {snapshot.route.length ? (
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Next Best Inspection Path</p>
          <div className="mt-2 space-y-2">
            {snapshot.route.slice(0, 3).map((step, index) => (
              <div key={step.section} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-xs font-semibold text-black">{index + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{step.section}</p>
                  <p className="text-xs text-[#8a93a3]">{step.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {habitPrompts.length ? (
        <div className="rounded-xl border border-purple-400/30 bg-purple-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-200">Inspector Memory</p>
          <p className="mt-1 text-xs text-[#8a93a3]">You commonly document these items, but they have not been seen here yet.</p>
          <div className="mt-2 space-y-1">
            {habitPrompts.map((habit) => <p key={habit.key} className="text-sm font-bold text-purple-100">○ {habit.label} · documented in {habit.count} prior workflow{habit.count === 1 ? "" : "s"}</p>)}
          </div>
        </div>
      ) : null}

      <button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-11 w-full rounded-xl border border-violet-300/40 bg-black/20 px-3 py-2 text-sm font-semibold text-violet-100 disabled:opacity-50">
        {loading ? "Syncing vision memory…" : "Sync Vision Memory"}
      </button>
    </section>
  );
}

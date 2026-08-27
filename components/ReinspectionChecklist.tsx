"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

type Finding = {
  id: number;
  title: string;
  section: string | null;
  severity: string | null;
  reinspection_status: string | null;
};

const STATUSES: { key: string; label: string; on: string }[] = [
  { key: "corrected", label: "Corrected", on: "border-emerald-400 bg-emerald-500/20 text-emerald-200" },
  { key: "not_corrected", label: "Not corrected", on: "border-red-400 bg-red-500/20 text-red-200" },
  { key: "not_evaluated", label: "Not evaluated", on: "border-slate-400 bg-slate-500/20 text-[var(--fl-text)]" },
];

// Shown on a re-inspection report: mark each carried-over finding as corrected,
// not corrected, or not evaluated. Saves per change.
export default function ReinspectionChecklist({ inspectionId }: { inspectionId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/inspections/reinspection?inspectionId=${inspectionId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFindings(d?.findings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [inspectionId]);

  async function setStatus(findingId: number, status: string) {
    setSaving(findingId);
    setFindings((prev) =>
      prev.map((f) => (f.id === findingId ? { ...f, reinspection_status: status } : f)),
    );
    try {
      await fetch("/api/inspections/reinspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, status }),
      });
    } finally {
      setSaving(null);
    }
  }

  const counts = {
    corrected: findings.filter((f) => f.reinspection_status === "corrected").length,
    not_corrected: findings.filter((f) => f.reinspection_status === "not_corrected").length,
    pending: findings.filter((f) => f.reinspection_status !== "corrected" && f.reinspection_status !== "not_corrected").length,
  };

  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 shadow-xl">
      <div className="flex items-center gap-3">
        <RotateCcw className="h-6 w-6 text-amber-300" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Re-inspection</p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">Verify Prior Findings</h2>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            Mark each item from the original inspection. {counts.corrected} corrected ·{" "}
            {counts.not_corrected} not corrected · {counts.pending} to review.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-[var(--fl-muted)]">Loading…</p>
      ) : findings.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--fl-muted)]">No findings carried over.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {findings.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3"
            >
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
                      disabled={saving === f.id}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                        active ? s.on : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

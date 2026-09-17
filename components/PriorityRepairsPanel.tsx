"use client";

// Report-builder panel: optionally generate an AI-ranked "Priority Repairs"
// ordering of every finding (most important first, each with a short cautious
// reason) and choose whether it shows on the client's report. Purely additive —
// it never changes the findings themselves. Renders on the client report via the
// share / client-portal / PDF / print surfaces when "Show on client report" is on.

import { useEffect, useMemo, useState } from "react";

type SlimFinding = { id: string; title: string; severity: string; section: string };
type PriorityItem = { findingId: string; reason: string };
type Summary = { generatedAt?: string; items: PriorityItem[] };

const SEVERITY_CHIP: Record<string, string> = {
  "Major Concern": "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]",
  "Safety Concern": "border-orange-500/50 bg-orange-500/10 text-[var(--fl-warn-text)]",
  "Recommended Repair": "border-amber-500/50 bg-amber-500/10 text-[var(--fl-warn-text)]",
  "Maintenance": "border-sky-500/50 bg-sky-500/10 text-[var(--fl-info-text)]",
  "Monitor": "border-slate-500/50 bg-slate-500/10 text-[var(--fl-muted)]",
  "Informational": "border-slate-500/40 bg-slate-500/10 text-[var(--fl-muted)]",
};

export default function PriorityRepairsPanel({
  inspectionId,
  findings,
}: {
  inspectionId: string;
  findings: SlimFinding[];
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [error, setError] = useState("");

  const findingMap = useMemo(
    () => new Map(findings.map((f) => [String(f.id), f])),
    [findings],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/${inspectionId}/priority`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setSummary(d.summary && Array.isArray(d.summary.items) ? d.summary : null);
        setVisible(Boolean(d.visible));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inspectionId]);

  // Resolve stored order to current findings (drop any that were deleted).
  const rankedRows = useMemo(() => {
    if (!summary) return [];
    return summary.items
      .map((item) => ({ finding: findingMap.get(String(item.findingId)), reason: item.reason }))
      .filter((row): row is { finding: SlimFinding; reason: string } => Boolean(row.finding));
  }, [summary, findingMap]);

  const unrankedCount = summary ? Math.max(0, findings.length - rankedRows.length) : 0;

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${inspectionId}/priority`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not generate the priority list.");
      setSummary(data.summary);
      setOpen(true);
    } catch (e: any) {
      setError(e?.message || "Could not generate the priority list.");
    } finally {
      setGenerating(false);
    }
  }

  // Persist the current resolved order (also drops any findings deleted since
  // generation). Called after a manual up/down move.
  async function persistOrder(rows: { finding: SlimFinding; reason: string }[]) {
    const items = rows.map((r) => ({ findingId: r.finding.id, reason: r.reason }));
    try {
      await fetch(`/api/reports/${inspectionId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    } catch {
      setError("Couldn't save the new order.");
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= rankedRows.length) return;
    const rows = [...rankedRows];
    [rows[index], rows[next]] = [rows[next], rows[index]];
    setSummary((prev) =>
      prev
        ? { ...prev, items: rows.map((r) => ({ findingId: r.finding.id, reason: r.reason })) }
        : prev,
    );
    void persistOrder(rows);
  }

  async function toggleVisible(next: boolean) {
    setVisible(next); // optimistic
    setSavingToggle(true);
    try {
      const res = await fetch(`/api/reports/${inspectionId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setVisible(!next); // roll back
      setError("Couldn't update the client-visibility setting.");
    } finally {
      setSavingToggle(false);
    }
  }

  const hasList = rankedRows.length > 0;

  return (
    <div className="mb-4 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>🧭</span>
            <h3 className="text-base font-semibold text-[var(--fl-text)]">Priority Repairs</h3>
            <span className="rounded-full border border-[var(--fl-line)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--fl-faint)]">
              Optional · AI
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
            {hasList
              ? `${rankedRows.length} finding${rankedRows.length === 1 ? "" : "s"} ranked most-important first.`
              : "Rank every finding by priority for the client — highest first."}
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating || findings.length === 0}
          className="shrink-0 rounded-lg border border-teal-500 bg-teal-500/10 px-3 py-1.5 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/20 disabled:opacity-50"
        >
          {generating ? "Ranking…" : hasList ? "Regenerate" : "Generate priority list"}
        </button>
        {hasList && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-sm font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
          >
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {error && (
        <div className="border-t border-[var(--fl-line)] px-4 py-2 text-sm font-bold text-[var(--fl-crit-text)]">
          {error}
        </div>
      )}

      {hasList && (
        <label className="flex cursor-pointer items-center gap-3 border-t border-[var(--fl-line)] px-4 py-3">
          <input
            type="checkbox"
            checked={visible}
            disabled={savingToggle}
            onChange={(e) => toggleVisible(e.target.checked)}
            className="h-4 w-4 accent-teal-500"
          />
          <span className="text-sm font-semibold text-[var(--fl-text)]">
            Show this Priority Repairs list on the client&apos;s report
          </span>
          {visible && <span className="text-xs font-bold text-[var(--fl-good-text)]">Client-visible</span>}
        </label>
      )}

      {hasList && open && (
        <div className="space-y-2 border-t border-[var(--fl-line)] p-4">
          <p className="text-xs text-[var(--fl-faint)]">Use ▲▼ to fine-tune the order — the client sees exactly this order.</p>
          {unrankedCount > 0 && (
            <p className="rounded-lg bg-[var(--fl-ground)] px-3 py-2 text-xs text-[var(--fl-warn-text)]">
              {unrankedCount} newer finding{unrankedCount === 1 ? "" : "s"} aren&apos;t ranked yet — Regenerate to include {unrankedCount === 1 ? "it" : "them"}.
            </p>
          )}
          <ol className="space-y-2">
            {rankedRows.map((row, i) => (
              <li
                key={row.finding.id}
                className="flex gap-3 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3"
              >
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/15 text-xs font-bold text-[var(--fl-accent-text)]">
                    {i + 1}
                  </span>
                  <div className="flex flex-col leading-none">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="h-4 text-[var(--fl-muted)] hover:text-[var(--fl-accent-text)] disabled:opacity-25"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === rankedRows.length - 1}
                      aria-label="Move down"
                      className="h-4 text-[var(--fl-muted)] hover:text-[var(--fl-accent-text)] disabled:opacity-25"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--fl-text)]">{row.finding.title}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        SEVERITY_CHIP[row.finding.severity] || "border-[var(--fl-line)] text-[var(--fl-muted)]"
                      }`}
                    >
                      {row.finding.severity}
                    </span>
                    <span className="text-xs text-[var(--fl-faint)]">{row.finding.section}</span>
                  </div>
                  {row.reason && <p className="mt-1 text-sm text-[var(--fl-muted)]">{row.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

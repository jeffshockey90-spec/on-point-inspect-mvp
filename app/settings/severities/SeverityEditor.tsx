"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SEVERITY_LEVELS, type SeverityLevel } from "../../../lib/severity/severityConfig";

type Row = SeverityLevel & { _key: string };

let keyCounter = 0;
function withKeys(levels: SeverityLevel[]): Row[] {
  return levels.map((l) => ({ ...l, _key: `${l.id}-${keyCounter++}` }));
}

function pillStyle(hex: string) {
  return { color: hex, background: `${hex}1f`, border: `1px solid ${hex}66` };
}

export default function SeverityEditor() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/severity-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(withKeys(d?.config?.levels?.length ? d.config.levels : DEFAULT_SEVERITY_LEVELS)))
      .catch(() => setRows(withKeys(DEFAULT_SEVERITY_LEVELS)))
      .finally(() => setLoading(false));
  }, []);

  function patch(key: string, p: Partial<SeverityLevel>) {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...p } : r)));
    setMsg(null);
  }
  function move(key: string, dir: -1 | 1) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r._key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setMsg(null);
  }
  function remove(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r._key !== key)));
    setMsg(null);
  }
  function add() {
    setRows((prev) => [
      ...prev,
      { _key: `new-${keyCounter++}`, id: `custom-${keyCounter}`, label: "New Level", color: "#ea580c", critical: false },
    ]);
    setMsg(null);
  }

  async function save(reset = false) {
    setSaving(true);
    setMsg(null);
    try {
      const body = reset
        ? { reset: true }
        : { config: { levels: rows.map(({ _key, ...l }) => ({ ...l, label: l.label.trim() })).filter((l) => l.label) } };
      const res = await fetch("/api/severity-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save.");
      setRows(withKeys(data.config.levels));
      setMsg({ tone: "ok", text: reset ? "Reverted to defaults." : "Saved. Applies across your reports." });
    } catch (e: any) {
      setMsg({ tone: "err", text: e?.message || "Couldn't save." });
    }
    setSaving(false);
  }

  if (loading) return <div className="text-[var(--fl-muted)]">Loading…</div>;

  const inputCls = "rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2 text-[var(--fl-text)] outline-none focus:border-teal-400";

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 shadow-xl sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--fl-faint)]">
        Order: top = least serious → bottom = most serious
      </p>

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r._key} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3">
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(r._key, -1)} disabled={i === 0} className="h-5 leading-none text-[var(--fl-muted)] hover:text-[var(--fl-text)] disabled:opacity-30">▲</button>
              <button type="button" onClick={() => move(r._key, 1)} disabled={i === rows.length - 1} className="h-5 leading-none text-[var(--fl-muted)] hover:text-[var(--fl-text)] disabled:opacity-30">▼</button>
            </div>

            <input
              type="color"
              value={r.color}
              onChange={(e) => patch(r._key, { color: e.target.value })}
              className="h-9 w-10 shrink-0 cursor-pointer rounded border border-[var(--fl-line)] bg-transparent"
              aria-label="Color"
            />

            <input
              value={r.label}
              onChange={(e) => patch(r._key, { label: e.target.value })}
              className={`${inputCls} min-w-0 flex-1`}
              placeholder="Level name"
            />

            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={pillStyle(r.color)}>
              {r.label || "Preview"}
            </span>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[var(--fl-muted)]">
              <input
                type="checkbox"
                checked={r.critical}
                onChange={(e) => patch(r._key, { critical: e.target.checked })}
                className="h-4 w-4 accent-red-500"
              />
              Safety/critical
            </label>

            <button
              type="button"
              onClick={() => remove(r._key)}
              disabled={rows.length <= 1}
              className="rounded-lg border border-[var(--fl-line)] px-2.5 py-1.5 text-xs font-bold text-[var(--fl-muted)] hover:border-red-500 hover:text-red-300 disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="rounded-xl border border-dashed border-[var(--fl-line)] px-4 py-2.5 text-sm font-semibold text-[var(--fl-muted)] hover:border-teal-400 hover:text-[var(--fl-accent-text)]"
      >
        + Add severity level
      </button>

      <p className="text-[11px] text-[var(--fl-faint)]">
        &quot;Safety/critical&quot; levels count toward safety findings and can block publishing, just like the default Safety &amp; Major Concern levels.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--fl-raised)] pt-4">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => { if (window.confirm("Revert all severity levels to the FLOW defaults?")) save(true); }}
          disabled={saving}
          className="rounded-xl border border-[var(--fl-line)] px-5 py-2.5 text-sm font-bold text-[var(--fl-muted)] hover:border-slate-400 disabled:opacity-60"
        >
          Revert to defaults
        </button>
        {msg && (
          <span className={`text-sm font-bold ${msg.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>
        )}
      </div>
    </section>
  );
}

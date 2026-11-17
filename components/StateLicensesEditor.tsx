"use client";

import { useState } from "react";
import { US_STATES } from "../lib/usStates";

type Row = { state: string; number: string };

// Settings: a license / certification number per state. Posts as a JSON hidden
// input ("state_licenses") with the rest of the company settings form.
export default function StateLicensesEditor({ initial }: { initial: Record<string, string> }) {
  const [rows, setRows] = useState<Row[]>(() => {
    const entries = Object.entries(initial || {}).map(([state, number]) => ({ state, number }));
    return entries.length ? entries : [{ state: "", number: "" }];
  });

  const value: Record<string, string> = {};
  for (const row of rows) {
    if (row.state && row.number.trim()) value[row.state] = row.number.trim();
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="state_licenses" value={JSON.stringify(value)} />
      {rows.map((row, index) => (
        <div key={index} className="flex min-w-0 flex-wrap items-center gap-2">
          <select
            value={row.state}
            onChange={(e) => update(index, { state: e.target.value })}
            className="w-28 shrink-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-text)]"
            aria-label="State"
          >
            <option value="">State</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
          <input
            value={row.number}
            onChange={(e) => update(index, { number: e.target.value })}
            placeholder="License / certification / association # for this state"
            className="min-w-0 flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-text)]"
          />
          <button
            type="button"
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            className="shrink-0 rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-muted)]"
            aria-label="Remove state"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((current) => [...current, { state: "", number: "" }])}
        className="rounded-lg border border-teal-500/50 px-3 py-2 text-xs font-semibold text-[var(--fl-accent-text)]"
      >
        + Add a state
      </button>
    </div>
  );
}

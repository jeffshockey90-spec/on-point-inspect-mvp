"use client";

import { useState } from "react";
import Link from "next/link";

type TeamMember = { userId: string; label: string };

type DispatchInspection = {
  id: string;
  address: string;
  client: string;
  date: string;
  time: string;
  inspectorId: string;
};

function formatDate(value: string) {
  if (!value) return "No date set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // Pin locale + timeZone so the server (UTC) and client (local) render the
  // same text - otherwise the date differs between them and React reports a
  // hydration mismatch (#418). UTC also keeps a date-only value on its own day.
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DispatchBoard({
  inspections,
  teamMembers,
}: {
  inspections: DispatchInspection[];
  teamMembers: TeamMember[];
}) {
  const [rows, setRows] = useState(inspections);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [filterInspectorId, setFilterInspectorId] = useState("all");

  async function reassign(inspectionId: string, inspectorId: string) {
    setSavingId(inspectionId);
    setError("");

    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.id === inspectionId ? { ...row, inspectorId } : row)),
    );

    try {
      const res = await fetch("/api/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspection_id: inspectionId, inspector_id: inspectorId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setRows(previous);
        setError(data?.error || "Could not reassign inspection.");
      }
    } catch {
      setRows(previous);
      setError("Could not reassign inspection. Check your connection and try again.");
    } finally {
      setSavingId("");
    }
  }

  const visibleRows =
    filterInspectorId === "all"
      ? rows
      : rows.filter((row) => row.inspectorId === filterInspectorId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
          Filter by inspector
        </label>
        <select
          value={filterInspectorId}
          onChange={(event) => setFilterInspectorId(event.target.value)}
          className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-teal-400"
        >
          <option value="all">All Inspectors</option>
          {teamMembers.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-sm font-bold text-red-300">
          {error}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-sm text-[var(--fl-muted)]">
          No inspections match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link
                  href={`/reports/${row.id}`}
                  className="break-words font-semibold text-[var(--fl-text)] hover:text-[var(--fl-accent-text)]"
                >
                  {row.address}
                </Link>
                <p className="mt-1 text-sm text-[var(--fl-muted)]">
                  {row.client} &middot; {formatDate(row.date)}
                  {row.time ? ` at ${row.time}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--fl-faint)]">
                  Assigned:
                </span>
                <select
                  value={row.inspectorId}
                  disabled={savingId === row.id}
                  onChange={(event) => reassign(row.id, event.target.value)}
                  className="rounded-xl border border-teal-500/50 bg-[var(--fl-surface)] px-3 py-2 text-sm font-bold text-[var(--fl-accent-text)] outline-none transition focus:border-teal-400 disabled:opacity-60"
                >
                  {teamMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.label}
                    </option>
                  ))}
                </select>
                {savingId === row.id && (
                  <span className="text-xs font-bold text-[var(--fl-faint)]">Saving...</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

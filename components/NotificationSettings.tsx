"use client";

import { useEffect, useState } from "react";

type Key =
  | "client_confirmation"
  | "client_reminder_sms"
  | "client_report_ready"
  | "agent_confirmation"
  | "agent_report_ready";

const GROUPS: { title: string; rows: { key: Key; label: string; desc: string }[] }[] = [
  {
    title: "Client",
    rows: [
      { key: "client_confirmation", label: "Appointment confirmation", desc: "Confirmation email & text when a job is scheduled or rescheduled." },
      { key: "client_reminder_sms", label: "24-hour reminder text", desc: "A text to the client the day before the inspection." },
      { key: "client_report_ready", label: "Report ready", desc: "Email & text letting the client know the report is published." },
    ],
  },
  {
    title: "Agent",
    rows: [
      { key: "agent_confirmation", label: "Appointment confirmation", desc: "Confirmation email & text to the buyer's / listing agent." },
      { key: "agent_report_ready", label: "Report ready", desc: "Report-published email & text to the agent." },
    ],
  },
];

type State = {
  isOwner: boolean;
  company: Record<Key, boolean>;
  overrides: Partial<Record<Key, boolean>>;
  effective: Record<Key, boolean>;
};

export default function NotificationSettings() {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/notifications", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok) setState(data);
      } catch {
        /* leave null → shows a soft message */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: Key, next: boolean) {
    if (!state || saving) return;
    setSaving(true);
    setError("");
    const scope = state.isOwner ? "company" : "inspector";
    // Optimistic: reflect the new effective value immediately.
    const prev = state;
    setState({ ...state, effective: { ...state.effective, [key]: next } });
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, prefs: { [key]: next } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setState(data);
    } catch (e: any) {
      setState(prev);
      setError(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function resetOverrides() {
    if (!state || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "inspector", reset: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not reset.");
      setState(data);
    } catch (e: any) {
      setError(e?.message || "Could not reset.");
    } finally {
      setSaving(false);
    }
  }

  const hasOverrides = state ? Object.keys(state.overrides).length > 0 : false;

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
      <h3 className="text-lg font-bold text-[var(--fl-text)]">Client &amp; agent notifications</h3>
      <p className="mt-1 text-sm text-[var(--fl-muted)]">
        {state?.isOwner
          ? "Your company defaults — they apply to every inspection unless an inspector overrides them for their own jobs. Turn any off to stop that message."
          : "Defaults are set by your company. Turn any off to override it for your own inspections."}
      </p>

      {!state ? (
        <p className="mt-4 text-sm text-[var(--fl-faint)]">Loading…</p>
      ) : (
        <div className="mt-4 space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                {group.title}
              </p>
              <div className="space-y-2">
                {group.rows.map((row) => {
                  const on = state.effective[row.key];
                  const overridden = !state.isOwner && row.key in state.overrides;
                  return (
                    <label
                      key={row.key}
                      className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--fl-text)]">
                          {row.label}
                          {overridden && (
                            <span className="ml-2 rounded-full border border-[var(--fl-line)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                              overridden
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--fl-muted)]">{row.desc}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={saving}
                        onChange={(e) => toggle(row.key, e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-teal-500"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {!state.isOwner && hasOverrides && (
            <button
              type="button"
              onClick={resetOverrides}
              disabled={saving}
              className="text-xs font-semibold text-[var(--fl-accent-text)] hover:underline disabled:opacity-50"
            >
              Reset to company defaults
            </button>
          )}

          {error && <p className="text-sm text-[var(--fl-crit-text)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

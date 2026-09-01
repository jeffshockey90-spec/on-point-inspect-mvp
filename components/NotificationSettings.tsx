"use client";

import { useEffect, useState } from "react";
import SettingsToggle from "./SettingsToggle";

type Key =
  | "client_confirmation"
  | "client_report_ready"
  | "agent_confirmation"
  | "agent_report_ready"
  | "client_reminder_24h"
  | "client_reminder_2h"
  | "client_reminder_30m"
  | "agent_reminder_24h"
  | "agent_reminder_2h"
  | "agent_reminder_30m";

type Window = "24h" | "2h" | "30m";
const WINDOWS: { key: Window; label: string }[] = [
  { key: "24h", label: "24 hours before" },
  { key: "2h", label: "2 hours before" },
  { key: "30m", label: "30 min before" },
];

// The non-reminder, event-driven messages.
const MESSAGE_GROUPS: { title: string; rows: { key: Key; label: string; desc: string }[] }[] = [
  {
    title: "Client",
    rows: [
      { key: "client_confirmation", label: "Appointment confirmation", desc: "Email & text when a job is scheduled or rescheduled." },
      { key: "client_report_ready", label: "Report ready", desc: "Email & text when the report is published." },
    ],
  },
  {
    title: "Agent",
    rows: [
      { key: "agent_confirmation", label: "Appointment confirmation", desc: "Confirmation email & text to the agent." },
      { key: "agent_report_ready", label: "Report ready", desc: "Report-published email & text to the agent." },
    ],
  },
];

type PrefState = {
  isOwner: boolean;
  company: Record<Key, boolean>;
  overrides: Partial<Record<Key, boolean>>;
  effective: Record<Key, boolean>;
};

type InspectorReminders = {
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  reminder_30m_enabled: boolean;
  // Preserve the rest of the settings object so we can POST it back whole.
  raw: Record<string, any>;
};

export default function NotificationSettings() {
  const [state, setState] = useState<PrefState | null>(null);
  const [insp, setInsp] = useState<InspectorReminders | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, iRes] = await Promise.all([
          fetch("/api/settings/notifications", { cache: "no-store" }),
          fetch("/api/settings/schedule-reminders", { cache: "no-store" }),
        ]);
        const pData = await pRes.json();
        if (!cancelled && pRes.ok) setState(pData);
        const iData = await iRes.json();
        if (!cancelled && iRes.ok) {
          setInsp({
            reminder_24h_enabled: iData.reminder_24h_enabled !== false,
            reminder_2h_enabled: iData.reminder_2h_enabled !== false,
            reminder_30m_enabled: iData.reminder_30m_enabled !== false,
            raw: iData,
          });
        }
      } catch {
        /* leave null → shows a soft message */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePref(key: Key, next: boolean) {
    if (!state || saving) return;
    setSaving(true);
    setError("");
    const scope = state.isOwner ? "company" : "inspector";
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

  async function toggleInspector(window: Window, next: boolean) {
    if (!insp || saving) return;
    setSaving(true);
    setError("");
    const field =
      window === "24h" ? "reminder_24h_enabled" : window === "2h" ? "reminder_2h_enabled" : "reminder_30m_enabled";
    const prev = insp;
    const optimistic = { ...insp, [field]: next } as InspectorReminders;
    setInsp(optimistic);
    try {
      // POST needs the whole settings object (absent fields reset to true), so
      // send the last-known settings with just this one flag changed.
      const body = { ...insp.raw, [field]: next };
      const res = await fetch("/api/settings/schedule-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setInsp({
        reminder_24h_enabled: data.reminder_24h_enabled !== false,
        reminder_2h_enabled: data.reminder_2h_enabled !== false,
        reminder_30m_enabled: data.reminder_30m_enabled !== false,
        raw: { ...insp.raw, ...data },
      });
    } catch (e: any) {
      setInsp(prev);
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

  // The reminder matrix: one row per recipient, one switch per time window.
  const reminderRows: {
    who: string;
    sub: string;
    get: (w: Window) => boolean;
    set: (w: Window, next: boolean) => void;
    overridden?: (w: Window) => boolean;
  }[] = [];
  if (state) {
    reminderRows.push({
      who: "Client",
      sub: "Text to the client",
      get: (w) => state.effective[`client_reminder_${w}` as Key],
      set: (w, next) => togglePref(`client_reminder_${w}` as Key, next),
      overridden: (w) => !state.isOwner && (`client_reminder_${w}` as Key) in state.overrides,
    });
    reminderRows.push({
      who: "Agent",
      sub: "Text to the agent",
      get: (w) => state.effective[`agent_reminder_${w}` as Key],
      set: (w, next) => togglePref(`agent_reminder_${w}` as Key, next),
      overridden: (w) => !state.isOwner && (`agent_reminder_${w}` as Key) in state.overrides,
    });
  }
  if (insp) {
    reminderRows.push({
      who: "Inspector",
      sub: "Push to your device",
      get: (w) =>
        w === "24h" ? insp.reminder_24h_enabled : w === "2h" ? insp.reminder_2h_enabled : insp.reminder_30m_enabled,
      set: (w, next) => toggleInspector(w, next),
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
      <h3 className="text-lg font-bold text-[var(--fl-text)]">Notifications &amp; reminders</h3>
      <p className="mt-1 text-sm text-[var(--fl-muted)]">
        {state?.isOwner
          ? "Company defaults for every inspection unless an inspector overrides them for their own jobs. Inspector push reminders are set per inspector."
          : "Defaults are set by your company. Turn any off to override it for your own inspections."}
      </p>

      {!state && !insp ? (
        <p className="mt-4 text-sm text-[var(--fl-faint)]">Loading…</p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* Appointment reminder matrix */}
          {reminderRows.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                Appointment reminders
              </p>
              <p className="mb-3 text-xs text-[var(--fl-muted)]">
                Choose which countdown reminders go out before each inspection.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-px whitespace-nowrap pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                        Recipient
                      </th>
                      {WINDOWS.map((w) => (
                        <th
                          key={w.key}
                          className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]"
                        >
                          {w.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reminderRows.map((r) => (
                      <tr key={r.who} className="border-t border-[var(--fl-line)]">
                        <td className="py-3 pr-4 align-middle">
                          <span className="block text-sm font-semibold text-[var(--fl-text)]">{r.who}</span>
                          <span className="block text-xs text-[var(--fl-muted)]">{r.sub}</span>
                        </td>
                        {WINDOWS.map((w) => (
                          <td key={w.key} className="py-3 text-center align-middle">
                            <span className="inline-flex flex-col items-center gap-1">
                              <SettingsToggle
                                checked={r.get(w.key)}
                                disabled={saving}
                                onChange={(next) => r.set(w.key, next)}
                                ariaLabel={`${r.who} ${w.label} reminder`}
                              />
                              {r.overridden?.(w.key) && (
                                <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                                  overridden
                                </span>
                              )}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Event-driven messages */}
          {state &&
            MESSAGE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                  {group.title}
                </p>
                <div className="space-y-2">
                  {group.rows.map((row) => {
                    const on = state.effective[row.key];
                    const overridden = !state.isOwner && row.key in state.overrides;
                    return (
                      <div
                        key={row.key}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3"
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
                        <SettingsToggle
                          checked={on}
                          disabled={saving}
                          onChange={(next) => togglePref(row.key, next)}
                          ariaLabel={`${group.title} ${row.label}`}
                          className="mt-0.5"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          {state && !state.isOwner && hasOverrides && (
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

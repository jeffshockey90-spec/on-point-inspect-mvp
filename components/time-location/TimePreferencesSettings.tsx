"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_TIME_ZONE,
  detectDeviceTimeZone,
  isValidTimeZone,
  writeStoredTimePreferences,
} from "../../lib/app-time";

const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "UTC", label: "UTC" },
] as const;

export default function TimePreferencesSettings() {
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/time-preferences", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;

        const resolvedZone = isValidTimeZone(data.timeZone)
          ? data.timeZone
          : detectDeviceTimeZone();
        setTimeZone(resolvedZone);
        writeStoredTimePreferences({
          timeZone: resolvedZone,
          timeFormat: data.timeFormat === "12h" ? "12h" : "24h",
        });
        setTimeFormat(data.timeFormat === "12h" ? "12h" : "24h");
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/settings/time-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeZone,
          timeFormat,
          deviceTimeZone: detectDeviceTimeZone(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        writeStoredTimePreferences({ timeZone, timeFormat });
      }
      setMessage(
        response.ok
          ? "Time preferences saved everywhere in the app."
          : data.error || "Unable to save time preferences.",
      );
    } catch {
      setMessage("Unable to save time preferences.");
    } finally {
      setBusy(false);
    }
  }

  function useDeviceTimeZone() {
    const detectedTimeZone = detectDeviceTimeZone() || DEFAULT_TIME_ZONE;
    setTimeZone(detectedTimeZone);
    setMessage(`Device time zone detected: ${detectedTimeZone}`);
  }

  return (
    <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 sm:p-6 md:p-8">
      <h2 className="text-xl font-semibold text-[var(--fl-accent-text)] sm:text-2xl">
        Time &amp; Location
      </h2>

      <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
        Appointments, reports, notifications, mileage logs, and activity
        timestamps use your local time zone.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Time zone
          </span>

          <select
            value={timeZone}
            onChange={(event) => {
              setTimeZone(event.target.value);
              setMessage("");
            }}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none transition focus:border-teal-400"
          >
            {!TIME_ZONES.some((zone) => zone.value === timeZone) && (
              <option value={timeZone}>{timeZone}</option>
            )}
            {TIME_ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs text-[var(--fl-faint)]">{timeZone}</p>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Clock format
          </span>

          <select
            value={timeFormat}
            onChange={(event) =>
              setTimeFormat(event.target.value === "12h" ? "12h" : "24h")
            }
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none transition focus:border-teal-400"
          >
            <option value="24h">24-hour (16:30)</option>
            <option value="12h">12-hour (4:30 PM)</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={useDeviceTimeZone}
          className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)]"
        >
          Use Device Time Zone
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save Time Settings"}
        </button>

        <a
          href="/mileage"
          className="rounded-xl border border-teal-500/50 px-5 py-3 text-center font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
        >
          Open Mileage Tracker →
        </a>
      </div>

      {message && (
        <p className="mt-3 text-sm font-bold text-[var(--fl-muted)]">{message}</p>
      )}
    </section>
  );
}

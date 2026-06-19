"use client";

import { useEffect, useState } from "react";

type ReminderSettings = {
  enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
};

export default function ScheduleReminderSettings() {
  const [settings, setSettings] = useState<ReminderSettings>({
    enabled: true,
    reminder_24h_enabled: true,
    reminder_2h_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSettings() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/settings/schedule-reminders", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Could not load reminder settings.");
      }

      setSettings({
        enabled: data.enabled !== false,
        reminder_24h_enabled: data.reminder_24h_enabled !== false,
        reminder_2h_enabled: data.reminder_2h_enabled !== false,
      });
    } catch (error: any) {
      setMessage(error?.message || "Could not load reminder settings.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(nextSettings: ReminderSettings) {
    setSettings(nextSettings);
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/settings/schedule-reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextSettings),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Could not save reminder settings.");
      }

      setMessage("Reminder settings saved.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save reminder settings.");
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const mainEnabled = settings.enabled;

  return (
    <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-teal-300">
            Schedule Reminders
          </p>

          <h2 className="mt-2 text-xl font-black text-white">
            Inspection reminder notifications
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Send push reminders before scheduled inspections. Turning this off
            pauses automatic schedule reminders without affecting normal push
            notifications.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || saving}
          onClick={() =>
            saveSettings({
              ...settings,
              enabled: !settings.enabled,
            })
          }
          className={`rounded-2xl px-5 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
            mainEnabled
              ? "border border-teal-400/40 bg-teal-500 text-black hover:bg-teal-300"
              : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {loading
            ? "Loading..."
            : saving
              ? "Saving..."
              : mainEnabled
                ? "Reminders On"
                : "Reminders Off"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label
          className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 ${
            mainEnabled
              ? "border-zinc-700 bg-black/30"
              : "border-zinc-800 bg-black/20 opacity-60"
          }`}
        >
          <div>
            <p className="font-bold text-white">24-hour reminder</p>
            <p className="mt-1 text-xs text-zinc-400">
              Sends the day before the inspection.
            </p>
          </div>

          <input
            type="checkbox"
            disabled={!mainEnabled || loading || saving}
            checked={settings.reminder_24h_enabled}
            onChange={(event) =>
              saveSettings({
                ...settings,
                reminder_24h_enabled: event.target.checked,
              })
            }
            className="h-5 w-5 accent-teal-400"
          />
        </label>

        <label
          className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 ${
            mainEnabled
              ? "border-zinc-700 bg-black/30"
              : "border-zinc-800 bg-black/20 opacity-60"
          }`}
        >
          <div>
            <p className="font-bold text-white">2-hour reminder</p>
            <p className="mt-1 text-xs text-zinc-400">
              Sends shortly before the inspection.
            </p>
          </div>

          <input
            type="checkbox"
            disabled={!mainEnabled || loading || saving}
            checked={settings.reminder_2h_enabled}
            onChange={(event) =>
              saveSettings({
                ...settings,
                reminder_2h_enabled: event.target.checked,
              })
            }
            className="h-5 w-5 accent-teal-400"
          />
        </label>
      </div>

      {message ? (
        <p className="mt-4 rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm font-bold text-zinc-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}

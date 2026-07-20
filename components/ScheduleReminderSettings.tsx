"use client";

import { useEffect, useState } from "react";

type ReminderSettings = {
  enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  reminder_30m_enabled: boolean;
  arrival_detection_enabled: boolean;
  departure_detection_enabled: boolean;
  mileage_prompt_enabled: boolean;
  radon_deployment_reminder_enabled: boolean;
  radon_retrieval_reminder_enabled: boolean;
};

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  reminder_30m_enabled: true,
  arrival_detection_enabled: true,
  departure_detection_enabled: true,
  mileage_prompt_enabled: true,
  radon_deployment_reminder_enabled: true,
  radon_retrieval_reminder_enabled: true,
};

type SettingKey = Exclude<keyof ReminderSettings, "enabled">;

const REMINDER_OPTIONS: Array<{
  key: SettingKey;
  title: string;
  description: string;
}> = [
  {
    key: "reminder_24h_enabled",
    title: "24-hour reminder",
    description: "Sends the day before the inspection.",
  },
  {
    key: "reminder_2h_enabled",
    title: "2-hour reminder",
    description: "Sends two hours before the inspection.",
  },
  {
    key: "reminder_30m_enabled",
    title: "30-minute reminder",
    description: "Sends a final reminder shortly before the inspection.",
  },
  {
    key: "arrival_detection_enabled",
    title: "Arrival detection",
    description: "Detects when you arrive within the property radius.",
  },
  {
    key: "departure_detection_enabled",
    title: "Finished-inspection prompt",
    description: "Asks whether you are finished after leaving the property.",
  },
  {
    key: "mileage_prompt_enabled",
    title: "Start mileage prompt",
    description: "Offers to begin mileage after the inspection is finished.",
  },
  {
    key: "radon_deployment_reminder_enabled",
    title: "Radon deployment reminder",
    description: "Reminds you when a radon device is scheduled for deployment.",
  },
  {
    key: "radon_retrieval_reminder_enabled",
    title: "Radon retrieval reminder",
    description: "Reminds you when a radon device is due for pickup.",
  },
];

function readBoolean(
  source: Record<string, unknown>,
  key: keyof ReminderSettings,
  fallback = true,
) {
  return typeof source?.[key] === "boolean"
    ? Boolean(source[key])
    : fallback;
}

function normalizeSettings(data: any): ReminderSettings {
  const source =
    data?.settings ||
    data?.preferences ||
    data?.data ||
    data ||
    {};

  return {
    enabled: readBoolean(source, "enabled"),
    reminder_24h_enabled: readBoolean(source, "reminder_24h_enabled"),
    reminder_2h_enabled: readBoolean(source, "reminder_2h_enabled"),
    reminder_30m_enabled: readBoolean(source, "reminder_30m_enabled"),
    arrival_detection_enabled: readBoolean(
      source,
      "arrival_detection_enabled",
    ),
    departure_detection_enabled: readBoolean(
      source,
      "departure_detection_enabled",
    ),
    mileage_prompt_enabled: readBoolean(source, "mileage_prompt_enabled"),
    radon_deployment_reminder_enabled: readBoolean(
      source,
      "radon_deployment_reminder_enabled",
    ),
    radon_retrieval_reminder_enabled: readBoolean(
      source,
      "radon_retrieval_reminder_enabled",
    ),
  };
}

export default function ScheduleReminderSettings() {
  const [settings, setSettings] =
    useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<
    keyof ReminderSettings | null
  >(null);
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
        throw new Error(data.error || "Could not load notification settings.");
      }

      setSettings(normalizeSettings(data));
    } catch (error: any) {
      setSettings(DEFAULT_SETTINGS);
      setMessage(
        error?.message ||
          "Could not load saved settings. All notifications remain on by default.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(
    nextSettings: ReminderSettings,
    changedKey: keyof ReminderSettings,
  ) {
    const previousSettings = settings;

    setSettings(nextSettings);
    setSavingKey(changedKey);
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
        throw new Error(data.error || "Could not save notification settings.");
      }

      setSettings(normalizeSettings(data?.settings ? data : nextSettings));
      setMessage("Notification settings saved.");
    } catch (error: any) {
      setSettings(previousSettings);
      setMessage(error?.message || "Could not save notification settings.");
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const mainEnabled = settings.enabled;
  const saving = savingKey !== null;

  function toggleMaster() {
    if (loading || saving) return;

    const enabled = !settings.enabled;

    void saveSettings(
      {
        enabled,
        reminder_24h_enabled: enabled,
        reminder_2h_enabled: enabled,
        reminder_30m_enabled: enabled,
        arrival_detection_enabled: enabled,
        departure_detection_enabled: enabled,
        mileage_prompt_enabled: enabled,
        radon_deployment_reminder_enabled: enabled,
        radon_retrieval_reminder_enabled: enabled,
      },
      "enabled",
    );
  }

  function toggleSetting(key: SettingKey, checked: boolean) {
    if (loading || saving || !mainEnabled) return;

    void saveSettings(
      {
        ...settings,
        [key]: checked,
      },
      key,
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-teal-300">
            Notifications
          </p>

          <h2 className="mt-2 text-xl font-black text-white">
            Inspection, mileage and radon alerts
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Control all scheduled inspection reminders, arrival and departure
            alerts, mileage prompts, and radon reminders in one place. Normal
            booking, payment, report, and support push notifications are not
            affected.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || saving}
          onClick={toggleMaster}
          className={`rounded-2xl px-5 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
            mainEnabled
              ? "border border-teal-400/40 bg-teal-500 text-black hover:bg-teal-300"
              : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {loading
            ? "Loading..."
            : savingKey === "enabled"
              ? "Saving..."
              : mainEnabled
                ? "All Alerts On"
                : "All Alerts Off"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {REMINDER_OPTIONS.map((option) => {
          const enabled = mainEnabled && settings[option.key];
          const isSaving = savingKey === option.key;

          return (
            <label
              key={option.key}
              className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition ${
                mainEnabled
                  ? "border-zinc-700 bg-black/30 hover:border-teal-500/50"
                  : "border-zinc-800 bg-black/20 opacity-60"
              }`}
            >
              <div className="min-w-0">
                <p className="font-bold text-white">{option.title}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  {option.description}
                </p>
                {isSaving ? (
                  <p className="mt-1 text-xs font-bold text-teal-300">
                    Saving…
                  </p>
                ) : null}
              </div>

              <input
                type="checkbox"
                disabled={!mainEnabled || loading || saving}
                checked={settings[option.key]}
                onChange={(event) =>
                  toggleSetting(option.key, event.target.checked)
                }
                className="h-5 w-5 shrink-0 accent-teal-400"
              />
            </label>
          );
        })}
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        New accounts and notification preferences that have never been changed
        default to On.
      </p>

      {message ? (
        <p className="mt-4 rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm font-bold text-zinc-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}

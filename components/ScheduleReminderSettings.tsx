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
  geofence_radius_meters: number;
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
  geofence_radius_meters: 220,
};

// The boolean toggle machinery excludes the master switch and the numeric
// geofence radius (handled by its own control).
type SettingKey = Exclude<
  keyof ReminderSettings,
  "enabled" | "geofence_radius_meters"
>;

const GEOFENCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 150, label: "150 m — tight" },
  { value: 220, label: "220 m — default" },
  { value: 300, label: "300 m — relaxed" },
  { value: 450, label: "450 m — loose" },
];

function clampRadius(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 220;
  return Math.min(1000, Math.max(100, Math.round(parsed)));
}

const GROUPS: Array<{
  title: string;
  options: Array<{
    key: SettingKey;
    title: string;
    description: string;
  }>;
}> = [
  {
    title: "Inspection reminders",
    options: [
      {
        key: "reminder_24h_enabled",
        title: "24-hour reminder",
        description: "Day before inspection",
      },
      {
        key: "reminder_2h_enabled",
        title: "2-hour reminder",
        description: "Two hours before inspection",
      },
      {
        key: "reminder_30m_enabled",
        title: "30-minute reminder",
        description: "Final reminder before inspection",
      },
    ],
  },
  {
    title: "Inspection workflow",
    options: [
      {
        key: "arrival_detection_enabled",
        title: "Arrival detection",
        description: "Detect arrival at the property",
      },
      {
        key: "departure_detection_enabled",
        title: "Departure detection",
        description: "Detect leaving the property to offer mileage tracking",
      },
      {
        key: "mileage_prompt_enabled",
        title: "Start mileage prompt",
        description: "Offer to start mileage tracking",
      },
    ],
  },
  {
    title: "Radon",
    options: [
      {
        key: "radon_deployment_reminder_enabled",
        title: "Deployment reminder",
        description: "Remind before device deployment",
      },
      {
        key: "radon_retrieval_reminder_enabled",
        title: "Retrieval reminder",
        description: "Remind when the device is due for pickup",
      },
    ],
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
    arrival_detection_enabled: readBoolean(source, "arrival_detection_enabled"),
    departure_detection_enabled: readBoolean(source, "departure_detection_enabled"),
    mileage_prompt_enabled: readBoolean(source, "mileage_prompt_enabled"),
    radon_deployment_reminder_enabled: readBoolean(
      source,
      "radon_deployment_reminder_enabled",
    ),
    radon_retrieval_reminder_enabled: readBoolean(
      source,
      "radon_retrieval_reminder_enabled",
    ),
    geofence_radius_meters: clampRadius(
      (source as Record<string, unknown>)?.geofence_radius_meters ?? 220,
    ),
  };
}

function ToggleSwitch({
  checked,
  disabled,
}: {
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition ${
        checked
          ? "border-teal-400/60 bg-teal-500"
          : "border-slate-600 bg-slate-800"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </span>
  );
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
        geofence_radius_meters: settings.geofence_radius_meters,
      },
      "enabled",
    );
  }

  function toggleSetting(key: SettingKey) {
    if (loading || saving || !mainEnabled) return;

    void saveSettings(
      {
        ...settings,
        [key]: !settings[key],
      },
      key,
    );
  }

  function changeRadius(value: number) {
    if (loading || saving || !mainEnabled) return;

    const next = clampRadius(value);
    if (next === settings.geofence_radius_meters) return;

    void saveSettings(
      {
        ...settings,
        geofence_radius_meters: next,
      },
      "geofence_radius_meters",
    );
  }

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-teal-500/30 bg-[#0b1220] shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
            Notifications
          </p>

          <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
            Inspection, mileage and radon alerts
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Manage scheduled reminders, property arrival and departure alerts,
            mileage prompts, and radon notifications.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || saving}
          onClick={toggleMaster}
          className={`shrink-0 rounded-xl border px-4 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
            mainEnabled
              ? "border-teal-400/50 bg-teal-500 text-slate-950 hover:bg-teal-400"
              : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
          }`}
        >
          {loading
            ? "Loading..."
            : savingKey === "enabled"
              ? "Saving..."
              : mainEnabled
                ? "Time & Location Alerts: On"
                : "Time & Location Alerts: Off"}
        </button>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
              {group.title}
            </h3>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
              {group.options.map((option, index) => {
                const checked = mainEnabled && settings[option.key];
                const isSaving = savingKey === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    disabled={!mainEnabled || loading || saving}
                    onClick={() => toggleSetting(option.key)}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-900/80 disabled:cursor-not-allowed ${
                      index > 0 ? "border-t border-slate-800" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-white sm:text-base">
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-400 sm:text-sm">
                        {option.description}
                      </span>
                      {isSaving ? (
                        <span className="mt-1 block text-xs font-bold text-teal-300">
                          Saving…
                        </span>
                      ) : null}
                    </span>

                    <ToggleSwitch
                      checked={checked}
                      disabled={!mainEnabled || loading || saving}
                    />
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section>
          <h3 className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Location detection
          </h3>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
            <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-black text-white sm:text-base">
                  Geofence radius
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-400 sm:text-sm">
                  How close counts as &ldquo;at the property&rdquo; for arrival
                  and departure detection
                </span>
                {savingKey === "geofence_radius_meters" ? (
                  <span className="mt-1 block text-xs font-bold text-teal-300">
                    Saving…
                  </span>
                ) : null}
              </span>

              <select
                value={settings.geofence_radius_meters}
                disabled={!mainEnabled || loading || saving}
                onChange={(event) => changeRadius(Number(event.target.value))}
                className="shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {GEOFENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                {GEOFENCE_OPTIONS.every(
                  (option) => option.value !== settings.geofence_radius_meters,
                ) ? (
                  <option value={settings.geofence_radius_meters}>
                    {settings.geofence_radius_meters} m — custom
                  </option>
                ) : null}
              </select>
            </div>
          </div>
        </section>

        <p className="text-xs leading-5 text-slate-500">
          New accounts and previously unset preferences default to On.
        </p>

        {message ? (
          <p className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-bold text-slate-200">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

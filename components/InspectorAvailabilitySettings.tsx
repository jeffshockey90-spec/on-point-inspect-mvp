"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TIME_ZONE,
  detectDeviceTimeZone,
  isValidTimeZone,
} from "../lib/app-time";

const DAY_OPTIONS = [
  { id: "MO", label: "Mon" },
  { id: "TU", label: "Tue" },
  { id: "WE", label: "Wed" },
  { id: "TH", label: "Thu" },
  { id: "FR", label: "Fri" },
  { id: "SA", label: "Sat" },
  { id: "SU", label: "Sun" },
] as const;

type TimeFormat = "12h" | "24h";

const DEFAULT_DAYS = ["MO", "TU", "WE", "TH", "FR"];
const DEFAULT_TIMES = ["10:00", "14:00", "16:30"];

function normalizeTime(value: unknown) {
  const match = String(value || "")
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  return match ? `${match[1]}:${match[2]}` : "";
}

function normalizeDate(value: unknown) {
  const clean = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function formatTime(value: string, format: TimeFormat) {
  const normalized = normalizeTime(value);
  if (!normalized) return value;

  if (format === "24h") return normalized;

  const [hoursText, minutes] = normalized.split(":");
  const hours = Number(hoursText);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutes} ${suffix}`;
}

function formatDate(value: string, timeZone: string) {
  const normalized = normalizeDate(value);
  if (!normalized) return value;

  const [year, month, day] = normalized.split("-").map(Number);
  const safeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(safeDate);
  } catch {
    return normalized;
  }
}

export default function InspectorAvailabilitySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [availableDays, setAvailableDays] = useState<string[]>(DEFAULT_DAYS);
  const [defaultTimes, setDefaultTimes] = useState<string[]>(DEFAULT_TIMES);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  const [newTime, setNewTime] = useState("");
  const [newBlockedDate, setNewBlockedDate] = useState("");

  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("24h");

  const orderedDays = useMemo(
    () =>
      DAY_OPTIONS.map((day) => day.id).filter((day) =>
        availableDays.includes(day),
      ),
    [availableDays],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [availabilityResponse, preferencesResponse] = await Promise.all([
          fetch("/api/inspector-availability", { cache: "no-store" }),
          fetch("/api/settings/time-preferences", { cache: "no-store" }),
        ]);

        const availabilityResult = await availabilityResponse
          .json()
          .catch(() => ({}));
        const preferencesResult = await preferencesResponse
          .json()
          .catch(() => ({}));

        if (!active) return;

        const availability = availabilityResult?.availability;

        if (availabilityResponse.ok && availability) {
          setBookingEnabled(availability.booking_enabled !== false);

          setAvailableDays(
            Array.isArray(availability.available_days)
              ? availability.available_days.filter((day: unknown) =>
                  DAY_OPTIONS.some((option) => option.id === day),
                )
              : DEFAULT_DAYS,
          );

          const loadedTimes = Array.isArray(availability.default_times)
            ? uniqueSorted(
                availability.default_times
                  .map(normalizeTime)
                  .filter(Boolean),
              )
            : DEFAULT_TIMES;

          setDefaultTimes(
            loadedTimes.length > 0 ? loadedTimes : DEFAULT_TIMES,
          );

          setBlockedDates(
            Array.isArray(availability.blocked_dates)
              ? uniqueSorted(
                  availability.blocked_dates
                    .map(normalizeDate)
                    .filter(Boolean),
                )
              : [],
          );

          const savedAvailabilityZone = String(
            availability.timezone || "",
          ).trim();

          if (isValidTimeZone(savedAvailabilityZone)) {
            setTimeZone(savedAvailabilityZone);
          }
        } else if (!availabilityResponse.ok) {
          throw new Error(
            availabilityResult?.error ||
              "Availability settings could not load.",
          );
        }

        if (preferencesResponse.ok) {
          const preferredZone = isValidTimeZone(preferencesResult?.timeZone)
            ? preferencesResult.timeZone
            : detectDeviceTimeZone() || DEFAULT_TIME_ZONE;

          setTimeZone(preferredZone);
          setTimeFormat(
            preferencesResult?.timeFormat === "12h" ? "12h" : "24h",
          );
        }
      } catch (loadError: any) {
        if (active) {
          setError(
            loadError?.message ||
              "Availability settings could not load. Run the booking SQL migration if this is the first install.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  function clearStatus() {
    setMessage("");
    setError("");
  }

  function toggleDay(day: string) {
    clearStatus();

    setAvailableDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
  }

  function addTime() {
    clearStatus();

    const normalized = normalizeTime(newTime);

    if (!normalized) {
      setError("Choose a valid appointment time.");
      return;
    }

    if (defaultTimes.includes(normalized)) {
      setError(`${formatTime(normalized, timeFormat)} is already listed.`);
      return;
    }

    setDefaultTimes((current) => uniqueSorted([...current, normalized]));
    setNewTime("");
  }

  function removeTime(time: string) {
    clearStatus();
    setDefaultTimes((current) => current.filter((item) => item !== time));
  }

  function addBlockedDate() {
    clearStatus();

    const normalized = normalizeDate(newBlockedDate);

    if (!normalized) {
      setError("Choose a valid blocked date.");
      return;
    }

    if (blockedDates.includes(normalized)) {
      setError(`${formatDate(normalized, timeZone)} is already blocked.`);
      return;
    }

    setBlockedDates((current) => uniqueSorted([...current, normalized]));
    setNewBlockedDate("");
  }

  function removeBlockedDate(date: string) {
    clearStatus();
    setBlockedDates((current) => current.filter((item) => item !== date));
  }

  async function save() {
    clearStatus();

    if (bookingEnabled && orderedDays.length === 0) {
      setError("Select at least one available day while public booking is enabled.");
      return;
    }

    if (bookingEnabled && defaultTimes.length === 0) {
      setError("Add at least one appointment time while public booking is enabled.");
      return;
    }

    setSaving(true);

    try {
      const resolvedTimeZone = isValidTimeZone(timeZone)
        ? timeZone
        : detectDeviceTimeZone() || DEFAULT_TIME_ZONE;

      const response = await fetch("/api/inspector-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_enabled: bookingEnabled,
          available_days: orderedDays,
          default_times: uniqueSorted(defaultTimes),
          blocked_dates: uniqueSorted(blockedDates),
          timezone: resolvedTimeZone,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error || "Availability could not be saved.",
        );
      }

      setTimeZone(resolvedTimeZone);
      setMessage("Availability saved.");
    } catch (saveError: any) {
      setError(
        saveError?.message || "Availability could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
          Public Scheduling
        </p>

        <h2 className="mt-2 text-xl font-semibold text-[var(--fl-accent-text)] sm:text-2xl">
          Booking Availability
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
          Control when clients and realtors may request inspections. Times
          display in your saved {timeFormat === "12h" ? "12-hour" : "24-hour"}{" "}
          format and use {timeZone}.
        </p>
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5">
          <p className="text-sm font-bold text-[var(--fl-muted)]">
            Loading availability…
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                    Public Booking
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                    Allow clients and realtors to submit inspection requests
                    online.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={bookingEnabled}
                  onClick={() => {
                    clearStatus();
                    setBookingEnabled((current) => !current);
                  }}
                  className={`relative h-8 w-14 shrink-0 rounded-full border transition ${
                    bookingEnabled
                      ? "border-teal-300 bg-[var(--fl-accent)]"
                      : "border-[var(--fl-line)] bg-[var(--fl-surface)]"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                      bookingEnabled ? "left-8" : "left-1"
                    }`}
                  />
                  <span className="sr-only">
                    {bookingEnabled
                      ? "Disable public booking"
                      : "Enable public booking"}
                  </span>
                </button>
              </div>

              <p
                className={`mt-4 text-sm font-semibold ${
                  bookingEnabled ? "text-[var(--fl-good-text)]" : "text-[var(--fl-faint)]"
                }`}
              >
                {bookingEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                Available Days
              </p>

              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Select every weekday on which booking requests may be made.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {DAY_OPTIONS.map((day) => {
                  const selected = availableDays.includes(day.id);

                  return (
                    <button
                      key={day.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleDay(day.id)}
                      className={`min-w-12 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? "border-teal-300 bg-[var(--fl-accent)] text-[var(--fl-accent-text)]"
                          : "border-[var(--fl-line)] bg-[var(--fl-ground)] text-[var(--fl-muted)] hover:border-teal-500/60"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                Default Times
              </p>

              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Add the appointment start times shown in the booking form.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="time"
                  value={newTime}
                  onChange={(event) => {
                    setNewTime(event.target.value);
                    clearStatus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTime();
                    }
                  }}
                  className="min-h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none transition focus:border-teal-400 sm:max-w-xs"
                />

                <button
                  type="button"
                  onClick={addTime}
                  className="min-h-12 rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
                >
                  + Add Time
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {defaultTimes.length > 0 ? (
                  defaultTimes.map((time) => (
                    <div
                      key={time}
                      className="inline-flex items-center gap-2 rounded-full border border-teal-500/40 bg-teal-500/10 py-2 pl-4 pr-2 text-sm font-semibold text-[var(--fl-accent-text)]"
                    >
                      <span>{formatTime(time, timeFormat)}</span>
                      <button
                        type="button"
                        onClick={() => removeTime(time)}
                        aria-label={`Remove ${formatTime(time, timeFormat)}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-[var(--fl-muted)] transition hover:bg-red-500/20 hover:text-[var(--fl-crit-text)]"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm font-bold text-[var(--fl-warn-text)]">
                    No appointment times have been added.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                Blocked Dates
              </p>

              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Block holidays, vacations, personal days, or any date on which
                requests should not be accepted.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="date"
                  value={newBlockedDate}
                  onChange={(event) => {
                    setNewBlockedDate(event.target.value);
                    clearStatus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addBlockedDate();
                    }
                  }}
                  className="min-h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none transition focus:border-teal-400 sm:max-w-xs"
                />

                <button
                  type="button"
                  onClick={addBlockedDate}
                  className="min-h-12 rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
                >
                  + Block Date
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {blockedDates.length > 0 ? (
                  blockedDates.map((date) => (
                    <div
                      key={date}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--fl-text)]">
                          {formatDate(date, timeZone)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--fl-faint)]">{date}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeBlockedDate(date)}
                        className="shrink-0 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-[var(--fl-crit-text)] transition hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--fl-faint)]">
                    No dates are currently blocked.
                  </p>
                )}
              </div>
            </div>
          </div>

          {message ? (
            <div
              role="status"
              className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-[var(--fl-good-text)]"
            >
              ✓ {message}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-[var(--fl-crit-text)]"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-6 border-t border-[var(--fl-line)] pt-5">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-[var(--fl-accent)] px-5 py-4 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-52"
            >
              {saving ? "Saving Availability…" : "Save Availability"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

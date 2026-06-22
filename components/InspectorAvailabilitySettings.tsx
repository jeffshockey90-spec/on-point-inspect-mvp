"use client";

import { useEffect, useState } from "react";

const DAY_OPTIONS = [
  { id: "MO", label: "Mon" },
  { id: "TU", label: "Tue" },
  { id: "WE", label: "Wed" },
  { id: "TH", label: "Thu" },
  { id: "FR", label: "Fri" },
  { id: "SA", label: "Sat" },
  { id: "SU", label: "Sun" },
];

export default function InspectorAvailabilitySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [availableDays, setAvailableDays] = useState<string[]>(["MO", "TU", "WE", "TH", "FR"]);
  const [defaultTimes, setDefaultTimes] = useState("10:00, 14:00, 16:30");
  const [blockedDates, setBlockedDates] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/inspector-availability", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));

        if (!active) return;

        if (response.ok && result?.availability) {
          setBookingEnabled(result.availability.booking_enabled !== false);
          setAvailableDays(Array.isArray(result.availability.available_days) ? result.availability.available_days : ["MO", "TU", "WE", "TH", "FR"]);
          setDefaultTimes(Array.isArray(result.availability.default_times) ? result.availability.default_times.join(", ") : "10:00, 14:00, 16:30");
          setBlockedDates(Array.isArray(result.availability.blocked_dates) ? result.availability.blocked_dates.join(", ") : "");
        }
      } catch {
        if (active) setError("Availability settings could not load. Run the booking SQL migration if this is the first install.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  function toggleDay(day: string) {
    setAvailableDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  function splitList(value: string) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/inspector-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_enabled: bookingEnabled,
          available_days: availableDays,
          default_times: splitList(defaultTimes),
          blocked_dates: splitList(blockedDates),
          timezone: "America/New_York",
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(result?.error || "Availability could not be saved.");

      setMessage("Availability saved.");
    } catch (err: any) {
      setError(err?.message || "Availability could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-teal-500/30 bg-teal-950/10 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-teal-200">Booking Availability</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            These settings power the booking request system and give you a central place to control public scheduling.
          </p>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-xl bg-teal-400 px-4 py-3 text-sm font-black text-black transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Availability"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[.7fr_1.3fr_1fr]">
        <label className="rounded-xl border border-zinc-800 bg-black/30 p-4">
          <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Public Booking</span>
          <div className="mt-3 flex items-center gap-3">
            <input type="checkbox" checked={bookingEnabled} onChange={(event) => setBookingEnabled(event.target.checked)} className="h-5 w-5" />
            <span className="text-sm font-bold text-white">Enabled</span>
          </div>
        </label>

        <div className="rounded-xl border border-zinc-800 bg-black/30 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Available Days</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                className={`rounded-full border px-3 py-2 text-xs font-black ${availableDays.includes(day.id) ? "border-teal-400 bg-teal-400 text-black" : "border-zinc-700 bg-zinc-950 text-zinc-300"}`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <label className="rounded-xl border border-zinc-800 bg-black/30 p-4">
          <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Default Times</span>
          <input value={defaultTimes} onChange={(event) => setDefaultTimes(event.target.value)} className="mt-3 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-teal-400" placeholder="10:00, 14:00, 16:30" />
        </label>

        <label className="rounded-xl border border-zinc-800 bg-black/30 p-4 lg:col-span-3">
          <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Blocked Dates</span>
          <input value={blockedDates} onChange={(event) => setBlockedDates(event.target.value)} className="mt-3 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-teal-400" placeholder="2026-07-04, 2026-12-25" />
          <p className="mt-2 text-xs text-zinc-500">Separate dates with commas.</p>
        </label>
      </div>

      {message ? <p className="mt-4 text-sm font-bold text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}
    </section>
  );
}

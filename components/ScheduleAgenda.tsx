"use client";

import { useMemo, useState } from "react";
import InspectionWeatherChip from "./InspectionWeatherChip";

// Day-by-day list of upcoming appointments: the phone-friendly default view on
// the Schedule page. Each job shows its full time, address, client and type;
// tapping it (or "Move") opens the same Edit Appointment sheet the calendar
// uses, where the date and time can be changed.

export type AgendaEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  displayTime: string;
  address: string;
  client: string;
  type: string;
  status: string;
  inspectorName?: string;
  color: string;
  lat?: number | null;
  lng?: number | null;
};

const FIRST_DAYS = 14;

function dayLabel(date: string, today: string) {
  const d = new Date(`${date}T12:00:00`);
  const text = Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return date === today ? `Today · ${text}` : text;
}

function daysBetween(a: string, b: string) {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  return Math.round((db - da) / 86400000);
}

export function AgendaRow({
  event,
  onOpen,
  onMove,
}: {
  event: AgendaEvent;
  onOpen: () => void;
  onMove: () => void;
}) {
  const cancelled = event.status.toLowerCase().includes("cancel");
  const [clock, ampm] = event.displayTime.split(" ");
  return (
    <div className="flex items-stretch gap-3 border-t border-[var(--fl-line)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left [touch-action:manipulation]">
        <span className="w-14 shrink-0 font-mono text-[13px] font-semibold tabular-nums text-[var(--fl-text)]">
          {clock}
          {ampm ? <span className="block text-[11px] font-normal text-[var(--fl-muted)]">{ampm}</span> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-[15px] font-semibold ${cancelled ? "text-[var(--fl-muted)] line-through" : "text-[var(--fl-text)]"}`}>
            {event.address}
          </span>
          <span className="block truncate text-xs text-[var(--fl-muted)]">
            {[event.client || "Client not entered", event.inspectorName ? `👤 ${event.inspectorName}` : ""].filter(Boolean).join(" · ")}
          </span>
          <span
            className="mt-1 inline-block max-w-full truncate rounded-full border px-2 py-px text-[11px] font-semibold"
            style={{ color: event.color, borderColor: `${event.color}66` }}
          >
            {cancelled ? "Cancelled" : event.type || "Home Inspection"}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onMove}
        className="self-center rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-text)] transition hover:border-[var(--fl-accent)]/50 [touch-action:manipulation]"
      >
        Move
      </button>
    </div>
  );
}

export default function ScheduleAgenda({
  events,
  today,
  onOpen,
  onMove,
}: {
  events: AgendaEvent[];
  today: string;
  onOpen: (id: string) => void;
  onMove: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const days = useMemo(() => {
    const upcoming = events
      .filter((e) => !today || e.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const byDay = new Map<string, AgendaEvent[]>();
    if (today) byDay.set(today, []);
    for (const e of upcoming) {
      if (!byDay.has(e.date)) byDay.set(e.date, []);
      byDay.get(e.date)!.push(e);
    }
    return Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [events, today]);

  const shown = showAll ? days : days.slice(0, FIRST_DAYS);

  // "Today" is worked out after load (time zone); until then show nothing
  // rather than briefly listing past jobs.
  if (!today) return null;

  return (
    <div className="space-y-3">
      {shown.map(([date, list]) => {
        const first = list[0];
        const showWeather = first && today && daysBetween(today, date) <= 7;
        return (
          <div key={date}>
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
                {dayLabel(date, today)}
              </p>
              {showWeather ? (
                <InspectionWeatherChip lat={first.lat} lng={first.lng} address={first.address} date={date} />
              ) : null}
            </div>
            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              {list.length === 0 ? (
                <p className="text-sm text-[var(--fl-muted)]">No inspections today</p>
              ) : (
                list.map((e) => (
                  <AgendaRow key={e.id} event={e} onOpen={() => onOpen(e.id)} onMove={() => onMove(e.id)} />
                ))
              )}
            </div>
          </div>
        );
      })}
      {days.length > FIRST_DAYS ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex min-h-11 w-full items-center justify-center text-sm font-semibold text-[var(--fl-accent-text)]"
        >
          {showAll ? "Show fewer days" : `Show all ${days.length} days`}
        </button>
      ) : null}
      {days.length <= 1 && (days[0]?.[1].length || 0) === 0 ? (
        <p className="px-1 text-sm text-[var(--fl-muted)]">Nothing else scheduled. Past jobs are in Month view.</p>
      ) : null}
    </div>
  );
}

import Link from "next/link";

// A compact "Today's Route" dashboard widget: the day's stops in appointment
// order, each with one-tap directions, plus a link into the full /route planner
// (which optimizes the drive order from the office and totals the mileage).

export type RouteStop = {
  id: string;
  time: string | null;
  address: string;
  locality: string;
  client: string;
  mapsQuery: string;
};

// "13:30" / "13:30:00" -> "1:30 PM". Falls back to the raw value if unparseable.
function formatClock(time: string | null): string {
  if (!time) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time).trim());
  if (!m) return String(time);
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

export default function TodayRoute({ stops }: { stops: RouteStop[] }) {
  return (
    <section className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
            Today's Route
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
            {stops.length === 0
              ? "No stops today"
              : `${stops.length} stop${stops.length === 1 ? "" : "s"}`}
          </h2>
        </div>
        <Link
          href="/route"
          className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)]"
        >
          Plan Route
        </Link>
      </div>

      {stops.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--fl-muted)]">
          Nothing scheduled today. The{" "}
          <Link href="/route" className="text-[var(--fl-accent-text)] underline">
            route planner
          </Link>{" "}
          optimizes any day's stops by drive time.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--fl-muted)]">
            In appointment order — open the planner to optimize by drive time.
          </p>
          <ol className="mt-4 space-y-2">
            {stops.map((stop, index) => (
              <li
                key={stop.id}
                className="flex items-center gap-3 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--fl-accent-bg)] font-mono text-xs font-bold text-[var(--fl-accent-text)] tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    {stop.time ? (
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--fl-accent-text)]">
                        {formatClock(stop.time)}
                      </span>
                    ) : null}
                    <Link
                      href={`/reports/${stop.id}`}
                      className="truncate font-semibold text-[var(--fl-text)] hover:text-[var(--fl-accent-text)]"
                    >
                      {stop.address}
                    </Link>
                  </div>
                  <p className="truncate text-xs text-[var(--fl-muted)]">
                    {[stop.client, stop.locality].filter(Boolean).join(" · ") || "No client listed"}
                  </p>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${stop.mapsQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent)] transition-colors hover:border-[var(--fl-accent)]/50 hover:bg-[var(--fl-accent)]/10"
                >
                  Directions
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

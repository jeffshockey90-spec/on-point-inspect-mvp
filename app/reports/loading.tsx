// Instant feedback while the Reports list's server work runs (all your
// inspections, view counts, contacts, agreements). Without it, tapping
// "Reports" in the bottom nav looked like nothing happened for a few seconds,
// so it got tapped again — which restarted the load. Mirrors the page: a
// search/sort bar and a grid of report cards.
export default function ReportsLoading() {
  const cards = Array.from({ length: 6 });

  return (
    <div
      className="min-h-screen bg-[var(--fl-ground)] px-3 py-4 sm:px-6 sm:py-6"
      aria-busy="true"
      aria-label="Loading reports"
    >
      <div className="mx-auto w-full max-w-7xl animate-pulse space-y-4">
        <div className="h-8 w-40 rounded-lg bg-[var(--fl-raised)]" />
        <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3">
          <div className="h-10 min-w-0 flex-1 rounded-xl bg-[var(--fl-raised)]" />
          <div className="h-10 w-40 rounded-xl bg-[var(--fl-raised)]" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)]"
            >
              <div className="h-40 bg-[var(--fl-raised)]" />
              <div className="space-y-3 p-5">
                <div className="h-6 w-3/4 rounded bg-[var(--fl-raised)]" />
                <div className="h-4 w-1/2 rounded bg-[var(--fl-raised)]" />
                <div className="flex gap-2">
                  <div className="h-6 w-20 rounded-full bg-[var(--fl-raised)]" />
                  <div className="h-6 w-16 rounded-full bg-[var(--fl-raised)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

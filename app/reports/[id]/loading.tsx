// Instant feedback while the report builder's server work runs (DB fetches,
// signed-URL signing, severity/template resolution). Next.js renders this the
// moment you tap into a report, so you never stare at a frozen blank/previous
// screen — the biggest "is it broken?" moment on iOS/Capacitor. It mirrors the
// builder's shape: a header bar + a stack of collapsed section rows.
export default function ReportBuilderLoading() {
  const sections = Array.from({ length: 6 });

  return (
    <div
      className="min-h-screen bg-[var(--fl-ground)] px-3 py-4 sm:px-6 sm:py-6"
      aria-busy="true"
      aria-label="Loading report"
    >
      <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4">
        {/* Header / title bar */}
        <div className="space-y-3 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4 sm:p-6">
          <div className="h-6 w-2/3 rounded-lg bg-[var(--fl-raised)] sm:h-8" />
          <div className="h-4 w-1/2 rounded bg-[var(--fl-raised)]" />
          <div className="flex flex-wrap gap-2 pt-1">
            <div className="h-8 w-28 rounded-xl bg-[var(--fl-raised)]" />
            <div className="h-8 w-28 rounded-xl bg-[var(--fl-raised)]" />
            <div className="h-8 w-20 rounded-xl bg-[var(--fl-raised)]" />
          </div>
        </div>

        {/* Section rows (collapsed) */}
        <div className="space-y-3">
          {sections.map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4 shadow-lg sm:gap-4 sm:p-5"
            >
              <div className="h-9 w-9 shrink-0 rounded-xl bg-[var(--fl-raised)] sm:h-10 sm:w-10" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-1/3 rounded bg-[var(--fl-raised)] sm:h-6" />
                <div className="h-3 w-20 rounded bg-[var(--fl-raised)]" />
              </div>
              <div className="h-8 w-16 shrink-0 rounded-xl bg-[var(--fl-raised)]" />
            </div>
          ))}
        </div>

        <p className="pt-2 text-center text-sm font-semibold text-[var(--fl-muted)]">
          Loading report…
        </p>
      </div>
    </div>
  );
}

// App-wide instant loading state. Next.js shows this the moment a link is
// clicked (while the destination's server component and data load), so
// navigation feels immediate instead of "dead" — the biggest fix for the
// click-feels-delayed / have-to-click-twice problem. The persistent Nav stays;
// only the page content area shows this.
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500/25 border-t-teal-400" />
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-teal-400">Loading</p>
      </div>
    </div>
  );
}

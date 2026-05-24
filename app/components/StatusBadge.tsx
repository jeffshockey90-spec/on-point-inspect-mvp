export function StatusBadge({ status }: { status?: string | null }) {
  const label = status || "draft";
  return <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-onpoint-teal">{label}</span>;
}

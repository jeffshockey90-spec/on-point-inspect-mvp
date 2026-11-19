// "Scope of This Inspection" for limited-scope jobs (e.g. Mechanical &
// Structural): what was inspected and what was not. Maryland requires a
// limited-scope report to state both. Lists come from lib/report/serviceScope.

import type { ReportScope } from "../lib/report/serviceScope";

export default function ReportScopeSection({
  scope,
  tone = "theme",
  className = "",
}: {
  scope: ReportScope | null;
  tone?: "theme" | "print";
  className?: string;
}) {
  if (!scope) return null;
  const box =
    tone === "print"
      ? "border-slate-300 bg-white text-slate-950"
      : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)]";
  const muted = tone === "print" ? "text-slate-600" : "text-[var(--fl-muted)]";
  const list = (items: string[]) =>
    items.length ? (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className={`mt-2 text-sm ${muted}`}>None listed.</p>
    );
  return (
    <section aria-label="Scope of this inspection" className={`break-inside-avoid rounded-2xl border p-6 ${box} ${className}`}>
      <h2 className="text-xl font-bold">Scope of This Inspection</h2>
      <p className={`mt-1 text-sm ${muted}`}>
        {scope.serviceName ? `${scope.serviceName} — ` : ""}a limited-scope inspection, not a complete home
        inspection. Only the systems and components listed as inspected were evaluated.
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">Inspected</h3>
          {list(scope.included)}
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">Not Inspected</h3>
          {list(scope.excluded)}
        </div>
      </div>
    </section>
  );
}

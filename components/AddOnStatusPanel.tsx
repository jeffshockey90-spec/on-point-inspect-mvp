// Shows the add-on services billed on this inspection (standalone invoices
// linked to it) with their paid status, plus the client's agreement status —
// so "is the mold add-on paid + signed?" is a glance, not a hunt. Renders
// nothing when there are no add-on invoices. Presentational: the server page
// loads the data.
export type AddOnInvoice = {
  id: string;
  service: string;
  total: number;
  paid: boolean;
  status: string; // draft | sent | paid | …
};

function money(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function AddOnStatusPanel({
  invoices,
  agreementSigned,
}: {
  invoices: AddOnInvoice[];
  agreementSigned: boolean | null;
}) {
  if (!invoices || invoices.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 print:hidden">
      <h3 className="text-lg font-bold text-[var(--fl-text)]">Add-on Services</h3>
      <p className="mb-3 mt-0.5 text-xs text-[var(--fl-muted)]">
        Services added after the original job — their own invoice + the client&apos;s agreement.
      </p>

      <ul className="space-y-2">
        {invoices.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3"
          >
            <span className="font-semibold text-[var(--fl-text)]">
              {inv.service} <span className="text-[var(--fl-muted)]">· {money(inv.total)}</span>
            </span>
            <span className="flex items-center gap-2">
              {inv.paid ? (
                <Pill tone="good">Paid ✓</Pill>
              ) : String(inv.status).toLowerCase() === "draft" ? (
                <Pill tone="muted">Draft</Pill>
              ) : (
                <Pill tone="warn">Awaiting payment</Pill>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="font-semibold text-[var(--fl-muted)]">Client agreement:</span>
        {agreementSigned === true ? (
          <Pill tone="good">Signed ✓</Pill>
        ) : agreementSigned === false ? (
          <Pill tone="warn">Awaiting signature</Pill>
        ) : (
          <Pill tone="muted">—</Pill>
        )}
      </div>
    </section>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "warn" | "muted";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]"
      : tone === "warn"
        ? "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]"
        : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {children}
    </span>
  );
}

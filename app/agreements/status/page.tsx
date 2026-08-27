import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";
import { formatDateOnly } from "../../../lib/app-time";
import AgreementStatusResend from "./AgreementStatusResend";

export const dynamic = "force-dynamic";

type Signer = {
  inspection_id: any;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  agreement_required?: boolean | null;
  agreement_signed?: boolean | null;
  signed_at?: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  signed: { label: "All signed", cls: "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]" },
  partial: { label: "Partly signed", cls: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]" },
  unsigned: { label: "Unsigned", cls: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]" },
  none: { label: "No signer set", cls: "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]" },
};

export default async function AgreementStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const filter = await resolveInspectionAccessFilter(supabase, user.id);

  const { data: inspections } = await supabase
    .from("inspections")
    .select(
      "id, client_name, property_address, address, inspection_date, created_at",
    )
    .eq(filter.column, filter.value)
    .order("created_at", { ascending: false })
    .limit(150);

  const ids = (inspections || []).map((i) => i.id);
  const contactsRes = ids.length
    ? await supabase
        .from("inspection_contacts")
        .select(
          "inspection_id, name, email, role, agreement_required, agreement_signed, signed_at",
        )
        .in("inspection_id", ids)
    : { data: [] as Signer[] };

  const byInspection = new Map<string, Signer[]>();
  for (const contact of (contactsRes.data as Signer[]) || []) {
    const role = String(contact.role || "").toLowerCase();
    if (role !== "client" && role !== "co-client") continue;
    if (contact.agreement_required === false) continue;
    const key = String(contact.inspection_id);
    const list = byInspection.get(key) || [];
    list.push(contact);
    byInspection.set(key, list);
  }

  const rows = (inspections || []).map((insp) => {
    const signers = byInspection.get(String(insp.id)) || [];
    const total = signers.length;
    const signed = signers.filter((s) => s.agreement_signed).length;
    let status: keyof typeof STATUS_META;
    if (total === 0) status = "none";
    else if (signed >= total) status = "signed";
    else if (signed > 0) status = "partial";
    else status = "unsigned";
    return { insp, signers, total, signed, status };
  });

  // Needs-attention first: unsigned, then partial, then signed, then no-signer.
  const order: Record<string, number> = { unsigned: 0, partial: 1, signed: 2, none: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  const pendingCount = rows.filter(
    (r) => r.status === "unsigned" || r.status === "partial",
  ).length;

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#14c8d2]">FLOW</p>
            <h1 className="mt-3 text-4xl font-extrabold">Agreement Signing Status</h1>
            <p className="mt-2 text-[var(--fl-muted)]">
              {pendingCount > 0
                ? `${pendingCount} inspection${pendingCount === 1 ? "" : "s"} still need a signature.`
                : "Every inspection with a required signer is signed."}
            </p>
          </div>
          <Link
            href="/agreements"
            className="inline-flex items-center justify-center rounded-2xl border border-teal-500/70 bg-teal-500/10 px-5 py-3 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-slate-950"
          >
            Agreement Library
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--fl-raised)] text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
              <tr>
                <th className="px-4 py-3">Property / Client</th>
                <th className="px-4 py-3">Inspection</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Signers</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ insp, signers, total, signed, status }) => {
                const meta = STATUS_META[status];
                return (
                  <tr key={String(insp.id)} className="border-b border-[var(--fl-raised)] align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/reports/${insp.id}`}
                        className="font-bold text-[var(--fl-text)] hover:text-[var(--fl-accent-text)]"
                      >
                        {insp.property_address || insp.address || "Property"}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--fl-muted)]">{insp.client_name || "Client"}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--fl-muted)]">
                      {insp.inspection_date ? formatDateOnly(insp.inspection_date) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${meta.cls}`}
                      >
                        {total > 0 && status !== "signed"
                          ? `${signed}/${total} signed`
                          : meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {signers.length === 0 ? (
                        <span className="text-xs text-[var(--fl-faint)]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {signers.map((s, i) => (
                            <span
                              key={`${insp.id}-${i}`}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                                s.agreement_signed
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]"
                                  : "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]"
                              }`}
                            >
                              {s.agreement_signed ? "✓" : "•"} {s.name || s.email || s.role || "Signer"}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === "unsigned" || status === "partial" ? (
                        <AgreementStatusResend inspectionId={String(insp.id)} />
                      ) : (
                        <span className="text-xs text-[var(--fl-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--fl-muted)]">
                    No inspections yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import RefundFilterTabs from "../../../../components/RefundFilterTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function getNumber(value: any) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getNumber(value));
}

function formatDateTime(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatAppValue(date, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function OwnerRefundsPage() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");

  const email = String(user.email || "").toLowerCase();
  if (!OWNER_EMAILS.includes(email)) redirect("/dashboard");

  const admin = createAdminClient();

  const [{ data: logs }, { data: inspections }] = await Promise.all([
    admin
      .from("audit_logs")
      .select("action, resource_id, metadata, created_at")
      .in("action", ["stripe_charge_refunded", "stripe_charge_disputed"])
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("inspections").select("id, property_address, address, client_name"),
  ]);

  const inspectionById = new Map((inspections || []).map((row: any) => [String(row.id), row]));

  const rows = (logs || []).map((log: any, index: number) => {
    const isDispute = String(log?.action) === "stripe_charge_disputed";
    const insp: any = log?.resource_id ? inspectionById.get(String(log.resource_id)) : null;
    return {
      id: `${log.action}-${log.resource_id}-${log.created_at}-${index}`,
      type: isDispute ? "dispute" : "refund",
      typeLabel: isDispute ? "Dispute" : "Refund",
      address: insp ? insp.property_address || insp.address || `Inspection #${log.resource_id}` : log?.resource_id ? `Inspection #${log.resource_id}` : "Unknown",
      client: insp?.client_name || "",
      inspectionId: log?.resource_id ? String(log.resource_id) : "",
      amount: getNumber(log?.metadata?.amountRefunded ?? log?.metadata?.amount),
      reason: log?.metadata?.reason || "",
      when: log?.created_at || null,
    };
  });

  const counts = {
    all: rows.length,
    refund: rows.filter((r) => r.type === "refund").length,
    dispute: rows.filter((r) => r.type === "dispute").length,
  };

  const totalRefunded = rows.filter((r) => r.type === "refund").reduce((s, r) => s + r.amount, 0);

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">Payments</p>
              <h1 className="mt-3 text-4xl font-semibold">Refunds &amp; Disputes</h1>
              <p className="mt-3 text-[var(--fl-muted)]">
                Every refund and chargeback synced from Stripe. {money(totalRefunded)} refunded across {counts.refund} refund{counts.refund === 1 ? "" : "s"}.
              </p>
            </div>
            <Link href="/dashboard/owner" className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10">
              Back to Owner Dashboard
            </Link>
          </div>
        </section>

        <RefundFilterTabs counts={counts} />

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-8 text-center text-[var(--fl-muted)]">
            No refunds or disputes recorded yet. They appear here the moment Stripe reports one.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--fl-raised)] text-sm">
                <thead className="bg-[var(--fl-ground)] text-left text-xs uppercase tracking-wide text-[var(--fl-muted)]">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Inspection</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--fl-raised)] bg-[var(--fl-surface-2)]">
                  {rows.map((row) => (
                    <tr key={row.id} data-refund-type={row.type} className="hover:bg-[var(--fl-surface-2)]">
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${row.type === "dispute" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-orange-500/40 bg-orange-500/10 text-orange-300"}`}>
                          {row.typeLabel}
                        </span>
                        {row.reason && <p className="mt-1 text-xs text-[var(--fl-faint)]">{row.reason}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[260px] truncate font-bold text-[var(--fl-text)]">{row.address}</p>
                        {row.client && <p className="text-xs text-[var(--fl-faint)]">{row.client}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-300">{row.amount > 0 ? money(row.amount) : "—"}</td>
                      <td className="px-4 py-3 text-[var(--fl-muted)]">{formatDateTime(row.when)}</td>
                      <td className="px-4 py-3 text-right">
                        {row.inspectionId && (
                          <Link href={`/reports/${row.inspectionId}`} className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] hover:border-teal-400 hover:bg-teal-500/10">
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

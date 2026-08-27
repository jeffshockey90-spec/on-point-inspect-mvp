import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { formatMoney, normalizeCurrency } from "../../lib/locale";
import PaySplitCommissionEditor from "../../components/PaySplitCommissionEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// Same fee resolution order the rest of the app uses (see PaymentInvoicePanel /
// analytics): the saved invoice/price fields, in priority order.
function getInspectionFee(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.price) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    0
  );
}

function isPublished(inspection: any) {
  const reportStatus = String(inspection?.report_status || "").toLowerCase();
  const status = String(inspection?.status || "").toLowerCase();
  return (
    inspection?.published === true ||
    inspection?.is_published === true ||
    inspection?.report_published === true ||
    Boolean(inspection?.published_at) ||
    reportStatus === "published" ||
    reportStatus === "ready" ||
    status === "published" ||
    status === "ready"
  );
}

function getDateValue(inspection: any) {
  return inspection?.inspection_date || inspection?.paid_at || inspection?.created_at || "";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Resolve the {from,to} range (inclusive) from searchParams, defaulting to the
// current calendar month. Values are YYYY-MM-DD.
function resolveRange(sp: { from?: string; to?: string }) {
  const now = new Date();
  const isValid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const from = isValid(sp.from)
    ? sp.from!
    : toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = isValid(sp.to)
    ? sp.to!
    : toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  return { from, to };
}

function inRange(dateValue: any, from: string, to: string) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  const iso = toISODate(d);
  return iso >= from && iso <= to;
}

function formatLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function PaySplitsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Only a company OWNER may view pay splits. A user can own one company and
  // also inspect for another, so match the owner membership specifically.
  const { data: ownerRows } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .not("company_id", "is", null)
    .limit(1);

  const companyId = ownerRows?.[0]?.company_id;

  // Non-owners (invited inspectors, realtors, clients) don't get earnings for
  // other people — send them to their own analytics instead.
  if (!companyId) redirect("/analytics");

  const sp = (await searchParams) || {};
  const { from, to } = resolveRange(sp);

  const [{ data: company }, { data: members }, { data: inspections }] = await Promise.all([
    // select("*") so a missing default_commission_pct column can't error the page.
    admin.from("companies").select("*").eq("id", companyId).maybeSingle(),
    admin
      .from("company_users")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    admin
      .from("inspections")
      .select("*")
      .eq("company_id", companyId),
  ]);

  const currency = normalizeCurrency(company?.currency);
  const companyName =
    company?.name || company?.business_name || company?.display_name || "Your Company";
  const defaultPct =
    company?.default_commission_pct == null ? 100 : getNumber(company.default_commission_pct);

  const memberRows = (members || []) as any[];
  const memberUserIds = memberRows.map((m) => m.user_id).filter(Boolean);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", memberUserIds.length ? memberUserIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));

  const nameFor = (userId: string) =>
    profileById.get(userId)?.full_name || profileById.get(userId)?.email || "Inspector";
  const emailFor = (userId: string) => profileById.get(userId)?.email || null;

  // Effective commission % for a member: their override, else the company default.
  const pctFor = (userId: string) => {
    const m = memberRows.find((r) => r.user_id === userId);
    const override = m?.commission_pct;
    return override == null ? defaultPct : getNumber(override);
  };

  // ---- Earnings per inspector, over the selected range ----
  const eligible = (inspections || []).filter(
    (i: any) => isPublished(i) && inRange(getDateValue(i), from, to)
  );

  type Earn = { userId: string; count: number; gross: number };
  const byInspector = new Map<string, Earn>();

  for (const i of eligible) {
    const uid = String(i?.inspector_id || i?.user_id || "");
    if (!uid) continue;
    const agg = byInspector.get(uid) || { userId: uid, count: 0, gross: 0 };
    agg.count += 1;
    agg.gross += getInspectionFee(i);
    byInspector.set(uid, agg);
  }

  const rows = [...byInspector.values()]
    .map((agg) => {
      const pct = pctFor(agg.userId);
      const inspectorCut = (agg.gross * pct) / 100;
      const companyCut = agg.gross - inspectorCut;
      return {
        ...agg,
        name: nameFor(agg.userId),
        email: emailFor(agg.userId),
        pct,
        inspectorCut,
        companyCut,
      };
    })
    .sort((a, b) => b.gross - a.gross || b.count - a.count);

  const totals = rows.reduce(
    (acc, r) => {
      acc.count += r.count;
      acc.gross += r.gross;
      acc.inspectorCut += r.inspectorCut;
      acc.companyCut += r.companyCut;
      return acc;
    },
    { count: 0, gross: 0, inspectorCut: 0, companyCut: 0 }
  );

  // Editor list: everyone on the team (so you can set a rate before they log
  // any inspections in the range).
  const editorMembers = memberRows.map((m) => ({
    userId: m.user_id,
    name: nameFor(m.user_id),
    email: emailFor(m.user_id),
    role: String(m.role || "member"),
    commissionPct: m.commission_pct == null ? null : getNumber(m.commission_pct),
  }));

  // Quick-link ranges.
  const now = new Date();
  const thisMonth = {
    from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
  const lastMonth = {
    from: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
  const thisYear = {
    from: toISODate(new Date(now.getFullYear(), 0, 1)),
    to: toISODate(new Date(now.getFullYear(), 11, 31)),
  };
  const isActiveRange = (r: { from: string; to: string }) => r.from === from && r.to === to;

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
                {companyName}
              </p>
              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">Pay Splits</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Per-inspector earnings on published inspections — gross fee billed, the inspector&apos;s
                commission cut, and the company&apos;s cut — for the selected date range.
              </p>
            </div>

            <Link
              href="/analytics"
              className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
            >
              Back to Analytics
            </Link>
          </div>
        </section>

        {/* Date range controls */}
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Date Range</h2>
              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                Showing {formatLabel(from)} – {formatLabel(to)}. Earnings use each inspection&apos;s date.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <RangeLink label="This Month" range={thisMonth} active={isActiveRange(thisMonth)} />
              <RangeLink label="Last Month" range={lastMonth} active={isActiveRange(lastMonth)} />
              <RangeLink label="This Year" range={thisYear} active={isActiveRange(thisYear)} />
            </div>
          </div>

          <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">From</span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">To</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl bg-teal-500 px-5 py-2.5 font-semibold text-black hover:bg-teal-400"
            >
              Apply
            </button>
          </form>
        </section>

        {/* Summary cards */}
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Gross Billed" value={formatMoney(totals.gross, currency)} helper={`${totals.count} published inspection${totals.count === 1 ? "" : "s"}`} tone="teal" />
          <MetricCard label="Inspector Cuts" value={formatMoney(totals.inspectorCut, currency)} helper="Total paid out to inspectors." tone="green" />
          <MetricCard label="Company Cut" value={formatMoney(totals.companyCut, currency)} helper="Retained by the company." tone="blue" />
          <MetricCard label="Inspectors" value={String(rows.length)} helper="With activity in this range." tone="purple" />
        </section>

        {/* Earnings table */}
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Earnings by Inspector</h2>
          <p className="mt-2 text-sm text-[var(--fl-muted)]">
            Gross fee billed, commission %, inspector&apos;s cut, and the company&apos;s cut per inspector.
          </p>

          <div className="mt-6">
            {rows.length === 0 ? (
              <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">
                No published inspections in this date range.
              </div>
            ) : (
              <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--fl-line)]">
                <div className="min-w-0 overflow-x-auto">
                  <table className="min-w-full divide-y divide-[var(--fl-raised)] text-sm">
                    <thead className="bg-[var(--fl-ground)] text-left text-xs uppercase tracking-wide text-[var(--fl-muted)]">
                      <tr>
                        <th className="px-4 py-3">Inspector</th>
                        <th className="px-4 py-3 text-right">Inspections</th>
                        <th className="px-4 py-3 text-right">Gross Billed</th>
                        <th className="px-4 py-3 text-right">Commission</th>
                        <th className="px-4 py-3 text-right">Inspector Cut</th>
                        <th className="px-4 py-3 text-right">Company Cut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fl-raised)] bg-[var(--fl-surface-2)]">
                      {rows.map((row) => (
                        <tr key={row.userId} className="hover:bg-[var(--fl-surface-2)]">
                          <td className="px-4 py-3">
                            <p className="max-w-[240px] truncate font-semibold text-[var(--fl-text)]">{row.name}</p>
                            {row.email && (
                              <p className="max-w-[240px] truncate text-xs text-[var(--fl-faint)]">{row.email}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[var(--fl-text)]">{row.count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[var(--fl-accent-text)]">
                            {formatMoney(row.gross, currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[var(--fl-muted)]">{row.pct}%</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-300">
                            {formatMoney(row.inspectorCut, currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-blue-300">
                            {formatMoney(row.companyCut, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-[var(--fl-line)] bg-[var(--fl-ground)]">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--fl-text)]">Totals</td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--fl-text)]">{totals.count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--fl-accent-text)]">
                          {formatMoney(totals.gross, currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--fl-faint)]">—</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-300">
                          {formatMoney(totals.inspectorCut, currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-300">
                          {formatMoney(totals.companyCut, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Commission editor */}
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Commission Rates</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--fl-muted)]">
            Set each inspector&apos;s cut of the gross fee. Leave blank to use the company default
            ({defaultPct}%). Changes apply to the earnings above immediately.
          </p>

          <div className="mt-6">
            <PaySplitCommissionEditor members={editorMembers} defaultPct={defaultPct} />
          </div>
        </section>
      </div>
    </main>
  );
}

function RangeLink({
  label,
  range,
  active,
}: {
  label: string;
  range: { from: string; to: string };
  active: boolean;
}) {
  return (
    <Link
      href={`/pay-splits?from=${range.from}&to=${range.to}`}
      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-teal-400 bg-teal-500/10 text-[var(--fl-accent-text)]"
          : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
      }`}
    >
      {label}
    </Link>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "teal" | "green" | "blue" | "purple";
}) {
  const colors: Record<string, string> = {
    teal: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]",
    green: "border-green-500/40 bg-green-500/10 text-green-300",
    blue: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    purple: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${colors[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">{helper}</p>
    </div>
  );
}

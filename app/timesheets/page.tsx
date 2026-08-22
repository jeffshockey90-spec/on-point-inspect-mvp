import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveTeamInspectorIds } from "../../lib/inspectionAccess";
import TimesheetExport from "../../components/TimesheetExport";
import TimesheetOverrideCell from "../../components/TimesheetOverrideCell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function fmtHours(h: number) {
  return `${h.toFixed(1)} h`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owner -> whole team; regular inspector -> just themselves. This is the
  // isolation boundary: the service-role query below is scoped to exactly these
  // ids, so no one sees another company's hours.
  const teamIds = await resolveTeamInspectorIds(supabase, user.id);

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const sp = await searchParams;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const from = sp?.from ? new Date(`${sp.from}T00:00:00Z`) : monthStart;
  const to = sp?.to ? new Date(`${sp.to}T23:59:59Z`) : monthEnd;
  // For the "current month" preset link.
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const { data: sessionRows } = await admin
    .from("inspection_presence_sessions")
    .select(
      "user_id, inspection_id, arrived_at, departed_at, inspections(property_address, address, inspection_date)",
    )
    .in("user_id", teamIds)
    .not("arrived_at", "is", null)
    .gte("arrived_at", from.toISOString())
    .lte("arrived_at", new Date(to.getTime() + 1000).toISOString())
    .order("arrived_at", { ascending: false });

  const { data: profs } = teamIds.length
    ? await admin.from("profiles").select("id, email").in("id", teamIds)
    : { data: [] as any[] };
  const emailById = new Map((profs || []).map((p: any) => [String(p.id), p.email || "Inspector"]));

  // A home inspection rarely runs past this; anything longer almost always means
  // the presence session was never closed (departure detection didn't fire), so
  // we flag it for review instead of counting a bogus number toward payroll.
  const MAX_PLAUSIBLE_HOURS = 12;

  type Session = {
    inspection_id: number;
    user_id: string;
    email: string;
    property: string;
    arrived_at: string | null;
    departed_at: string | null;
    hours: number | null;
    reason: string | null; // null = counts toward payroll; else why it's flagged
    manual: boolean; // hours set by a manual correction
  };
  const sessions: Session[] = (sessionRows || []).map((s: any) => {
    const insp = Array.isArray(s.inspections) ? s.inspections[0] : s.inspections;
    const arr = s.arrived_at ? new Date(s.arrived_at).getTime() : NaN;
    const dep = s.departed_at ? new Date(s.departed_at).getTime() : NaN;
    const hours =
      Number.isFinite(arr) && Number.isFinite(dep) && dep > arr ? (dep - arr) / 3_600_000 : null;
    let reason: string | null = null;
    if (hours == null) reason = "no departure logged";
    else if (hours > MAX_PLAUSIBLE_HOURS) reason = "unusually long — review";
    return {
      inspection_id: Number(s.inspection_id),
      user_id: String(s.user_id),
      email: emailById.get(String(s.user_id)) || "Inspector",
      property: insp?.property_address || insp?.address || "Inspection",
      arrived_at: s.arrived_at || null,
      departed_at: s.departed_at || null,
      hours,
      reason,
      manual: false,
    };
  });

  // A manual correction (timesheet_overrides) wins over the auto-captured GPS
  // hours — this is what makes flagged sessions payroll-usable.
  const overrideInspIds = [...new Set(sessions.map((s) => s.inspection_id).filter(Boolean))];
  const { data: overrideRows } = overrideInspIds.length
    ? await admin
        .from("timesheet_overrides")
        .select("inspection_id, hours")
        .in("inspection_id", overrideInspIds)
    : { data: [] as any[] };
  const overrideByInsp = new Map(
    (overrideRows || []).map((o: any) => [Number(o.inspection_id), o]),
  );
  for (const s of sessions) {
    const ov = overrideByInsp.get(s.inspection_id);
    if (ov && ov.hours != null) {
      s.hours = Number(ov.hours);
      s.reason = null;
      s.manual = true;
    }
  }

  const complete = sessions.filter((s) => s.reason == null);
  const needsReview = sessions.length - complete.length;

  // Per-inspector totals.
  const byInspector = new Map<string, { email: string; hours: number; jobs: number }>();
  for (const s of complete) {
    if (!byInspector.has(s.user_id)) byInspector.set(s.user_id, { email: s.email, hours: 0, jobs: 0 });
    const a = byInspector.get(s.user_id)!;
    a.hours += s.hours!;
    a.jobs += 1;
  }
  const inspectorTotals = [...byInspector.values()].sort((a, b) => b.hours - a.hours);
  const grandHours = complete.reduce((sum, s) => sum + (s.hours || 0), 0);

  const csvRows = complete.map((s) => ({
    inspector: s.email,
    date: s.arrived_at ? fmtDate(s.arrived_at) : "",
    property: s.property,
    arrived: s.arrived_at ? fmtDateTime(s.arrived_at) : "",
    departed: s.departed_at ? fmtDateTime(s.departed_at) : "",
    hours: s.hours != null ? s.hours.toFixed(2) : "",
  }));

  const preset = (label: string, f: Date, t: Date) => {
    const active = ymd(from) === ymd(f) && ymd(to) === ymd(t);
    return (
      <Link
        key={label}
        href={`/timesheets?from=${ymd(f)}&to=${ymd(t)}`}
        className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
          active
            ? "border-teal-400 bg-teal-500/15 text-teal-200"
            : "border-slate-700 text-slate-300 hover:border-teal-400 hover:text-teal-300"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-400">Payroll</p>
              <h1 className="mt-3 text-4xl font-black md:text-5xl">Timesheets</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                On‑site hours, captured automatically from GPS arrival and departure at each
                inspection. {inspectorTotals.length > 1 ? "Your whole team" : "Your hours"} for the
                selected period.
              </p>
            </div>
            <Link
              href="/analytics"
              className="rounded-xl border border-slate-600 px-5 py-3 font-black text-slate-200 transition hover:bg-slate-800"
            >
              Back to Analytics
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {preset("This month", monthStart, monthEnd)}
            {preset("Last month", lastMonthStart, lastMonthEnd)}
            {preset("This year", yearStart, monthEnd)}
            <span className="ml-auto text-sm text-slate-400">
              {ymd(from)} → {ymd(to)}
            </span>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Total Hours</p>
            <p className="mt-2 text-4xl font-black text-teal-300">{fmtHours(grandHours)}</p>
          </div>
          <div className="rounded-2xl border border-blue-500/40 bg-blue-950/20 p-6">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Jobs on Site</p>
            <p className="mt-2 text-4xl font-black text-blue-300">{complete.length}</p>
          </div>
          <div
            className={`rounded-2xl border p-6 ${
              needsReview > 0
                ? "border-amber-500/40 bg-amber-950/20"
                : "border-slate-700 bg-slate-950/40"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Needs Review
            </p>
            <p
              className={`mt-2 text-4xl font-black ${
                needsReview > 0 ? "text-amber-300" : "text-slate-500"
              }`}
            >
              {needsReview}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              No departure logged, or an unusually long session — excluded from the total.
            </p>
          </div>
        </section>

        {inspectorTotals.length > 1 && (
          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
            <h2 className="text-2xl font-black text-teal-300">By Inspector</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Inspector</th>
                    <th className="px-3 py-2 text-right">Jobs</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectorTotals.map((i) => (
                    <tr key={i.email} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-bold text-white">{i.email}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{i.jobs}</td>
                      <td className="px-3 py-2 text-right font-black text-teal-300">
                        {fmtHours(i.hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-black text-teal-300">Detail</h2>
            <TimesheetExport
              rows={csvRows}
              filename={`timesheet_${ymd(from)}_to_${ymd(to)}.csv`}
            />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Inspector</th>
                  <th className="px-3 py-2">Property</th>
                  <th className="px-3 py-2">Arrived</th>
                  <th className="px-3 py-2">Departed</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-right">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => (
                  <tr key={idx} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-bold text-white">{s.email}</td>
                    <td className="px-3 py-2 text-slate-300">{s.property}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtDateTime(s.arrived_at)}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtDateTime(s.departed_at)}</td>
                    <td className="px-3 py-2 text-right align-top">
                      {s.reason == null ? (
                        <span className="font-black text-teal-300">
                          {s.hours!.toFixed(1)}
                          {s.manual && (
                            <span className="ml-1 text-[10px] font-bold text-slate-500">edited</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-300">
                          {s.hours != null ? `${s.hours.toFixed(1)} · ` : ""}
                          {s.reason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <TimesheetOverrideCell
                        inspectionId={s.inspection_id}
                        current={s.manual ? s.hours : null}
                        manual={s.manual}
                      />
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No on‑site sessions in this period. Hours are captured automatically when GPS
                      arrival/departure detection is on during an inspection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

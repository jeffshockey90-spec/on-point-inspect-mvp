import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  computeEquipmentLife,
  equipmentName,
  buildMaintenancePlan,
  type EquipmentRow,
} from "../../../lib/homeMaintenance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function clean(v: any) {
  return v == null ? "" : String(v).trim();
}

const STATUS_STYLE: Record<string, { bar: string; chip: string; text: string }> = {
  healthy: { bar: "bg-emerald-400", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", text: "text-emerald-300" },
  aging: { bar: "bg-amber-400", chip: "border-amber-500/40 bg-amber-500/10 text-amber-200", text: "text-amber-300" },
  "near-end": { bar: "bg-rose-400", chip: "border-rose-500/40 bg-rose-500/10 text-rose-200", text: "text-rose-300" },
  unknown: { bar: "bg-slate-500", chip: "border-slate-600 bg-slate-700/30 text-slate-300", text: "text-slate-400" },
};

export default async function HomeownerPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = clean(token);

  // Resolve the inspection by its unguessable share token; fall back to a raw
  // numeric id so the owning inspector's direct link still works.
  let { data: inspection } = await admin
    .from("inspections")
    .select("*")
    .eq("public_share_token", lookup)
    .maybeSingle();
  if (!inspection && /^\d+$/.test(lookup)) {
    ({ data: inspection } = await admin
      .from("inspections")
      .select("*")
      .eq("id", lookup)
      .maybeSingle());
  }

  if (!inspection) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-center text-white">
        <div>
          <h1 className="text-3xl font-black">Home not found</h1>
          <p className="mt-3 text-slate-400">
            This homeowner link isn&apos;t valid or has expired. Please check with your inspector.
          </p>
        </div>
      </main>
    );
  }

  const inspectionId = inspection.id;
  const shareToken = clean(inspection.public_share_token) || String(inspectionId);

  const [{ data: equipmentRows }, { data: findingRows }, companyRes] = await Promise.all([
    admin.from("equipment_inventory").select("*").eq("inspection_id", inspectionId),
    admin
      .from("findings")
      .select("section, severity, title")
      .eq("inspection_id", inspectionId)
      .limit(400),
    inspection.company_id
      ? admin
          .from("companies")
          .select("name, display_name")
          .eq("id", inspection.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const equipment = (equipmentRows as EquipmentRow[]) || [];
  const findings = (findingRows as any[]) || [];
  const company = (companyRes as any)?.data || null;
  const companyName = clean(company?.display_name || company?.name) || "Your inspection company";

  const currentYear = new Date().getFullYear();
  const sections = Array.from(new Set(findings.map((f) => clean(f.section)).filter(Boolean)));
  const plan = buildMaintenancePlan(equipment, sections);

  const safetyItems = findings
    .filter((f) => /safety|major/i.test(clean(f.severity)))
    .map((f) => clean(f.title))
    .filter(Boolean)
    .slice(0, 6);

  const address =
    clean(inspection.property_address) || clean(inspection.address) || "Your Home";
  const cityLine = [clean(inspection.city), clean(inspection.state), clean(inspection.zip)]
    .filter(Boolean)
    .join(", ");
  const inspectedOn = clean(inspection.inspection_date);
  const yearBuilt = clean(inspection.year_built);

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Hero */}
        <section className="overflow-hidden rounded-3xl border border-teal-500/40 bg-gradient-to-br from-[#0f172a] to-[#0b1220] p-6 shadow-2xl md:p-10">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-400">
            Your Home
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight md:text-5xl">{address}</h1>
          {cityLine && <p className="mt-2 text-lg text-slate-300">{cityLine}</p>}
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            {yearBuilt && (
              <span className="rounded-full border border-slate-600 bg-black/30 px-3 py-1 text-slate-300">
                Built {yearBuilt}
              </span>
            )}
            {inspectedOn && (
              <span className="rounded-full border border-slate-600 bg-black/30 px-3 py-1 text-slate-300">
                Inspected {inspectedOn}
              </span>
            )}
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-teal-200">
              {companyName}
            </span>
          </div>
          <p className="mt-6 max-w-2xl text-slate-300">
            Welcome to your home&apos;s maintenance hub. Below are the major systems from your
            inspection with their expected life, plus a simple upkeep plan to keep everything
            running and protect your investment.
          </p>
          <Link
            href={`/share/${shareToken}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400"
          >
            View your full inspection report →
          </Link>
        </section>

        {/* Systems & equipment */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-teal-300">Your Systems &amp; Equipment</h2>
          {equipment.length === 0 ? (
            <p className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 text-slate-400">
              No equipment was catalogued for this home yet. Your full report has all the
              inspected details.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {equipment.map((row, i) => {
                const life = computeEquipmentLife(row, currentYear);
                const s = STATUS_STYLE[life.status];
                const name = equipmentName(row);
                const maker = clean(row.manufacturer);
                const recall = clean(row.recall_awareness);
                const known = clean(row.known_failure_patterns);
                const maintenance = clean(row.maintenance_schedule);
                return (
                  <div
                    key={row.id ?? i}
                    className="flex flex-col rounded-2xl border border-slate-800 bg-[#0f172a] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-white">{name}</p>
                        <p className="text-xs text-slate-400">
                          {[maker, clean(row.location)].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${s.chip}`}>
                        {life.status === "unknown" ? "Info" : `${life.pctUsed}% used`}
                      </span>
                    </div>

                    {/* Life bar */}
                    {life.pctUsed != null && (
                      <div className="mt-4">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${s.bar}`}
                            style={{ width: `${life.pctUsed}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            {life.ageYears != null ? `~${life.ageYears} yrs old` : "Age n/a"}
                            {life.serviceLifeYears != null ? ` of ~${life.serviceLifeYears} yr life` : ""}
                          </span>
                          {life.remainingYears != null && (
                            <span className={s.text}>~{life.remainingYears} yrs left</span>
                          )}
                        </div>
                      </div>
                    )}

                    <p className={`mt-3 text-xs font-bold ${s.text}`}>{life.statusLabel}</p>

                    {maintenance && (
                      <p className="mt-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
                        <span className="font-black text-slate-200">Upkeep: </span>
                        {maintenance}
                      </p>
                    )}
                    {(recall || known) && (
                      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                        <span className="font-black">Worth knowing: </span>
                        {[recall, known].filter(Boolean).join(" ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Maintenance plan */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-teal-300">Your Maintenance Plan</h2>
          <p className="text-sm text-slate-400">
            Tailored to the systems in your home. A little regular upkeep prevents most expensive
            repairs.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.map((task, i) => (
              <div key={i} className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-black text-white">{task.title}</p>
                  {task.season && (
                    <span className="shrink-0 rounded-full border border-slate-600 bg-black/30 px-2.5 py-1 text-[11px] font-black text-slate-300">
                      {task.season}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-teal-400">
                  {task.cadence}
                </p>
                <p className="mt-2 text-sm text-slate-300">{task.why}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety highlights */}
        {safetyItems.length > 0 && (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6">
            <h2 className="text-xl font-black text-rose-200">Safety items to prioritize</h2>
            <p className="mt-1 text-sm text-slate-300">
              Your inspector flagged these as safety or major concerns. See your full report for
              the details and photos.
            </p>
            <ul className="mt-4 space-y-2">
              {safetyItems.map((title, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  {title}
                </li>
              ))}
            </ul>
            <Link
              href={`/share/${shareToken}`}
              className="mt-4 inline-flex text-sm font-black text-rose-200 underline hover:text-white"
            >
              Open the full report →
            </Link>
          </section>
        )}

        <footer className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          Prepared for you by {companyName}. This hub is a homeowner convenience — your full
          inspection report is the official document.
        </footer>
      </div>
    </main>
  );
}

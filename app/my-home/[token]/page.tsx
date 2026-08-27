import Link from "next/link";
import { headers } from "next/headers";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  computeEquipmentLife,
  equipmentName,
  buildMaintenancePlan,
  type EquipmentRow,
} from "../../../lib/homeMaintenance";
import { isReportViewReload } from "../../../lib/reportViewThrottle";
import { sendPushNotification } from "../../../lib/push";
import ReportLanguageSwitcher from "../../../components/ReportLanguageSwitcher";
import UiAutoTranslate from "../../../components/UiAutoTranslate";
import { REPORT_UI_STRINGS } from "../../../lib/uiStrings";
import {
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  getReportTranslations,
  getUiTranslations,
  makeTranslator,
} from "../../../lib/translate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOMEOWNER_VIEW_TYPE = "homeowner_portal";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function clean(v: any) {
  return v == null ? "" : String(v).trim();
}

// Salted SHA-256 of the viewer IP — an opaque, per-inspection-comparable
// fingerprint (never a raw IP), matching how the report share page tracks.
function hashIp(value: string) {
  const salt =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "on-point-inspect";
  return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
}

// Record a homeowner-portal open. Stored under its OWN view_type so it never
// inflates report-view counts, and gated by the SAME 30-minute session throttle
// used across the app so reloads don't re-notify the inspector.
async function recordPortalView(inspection: any, token: string) {
  try {
    const numericId = Number(inspection?.id);
    if (!numericId || !Number.isFinite(numericId)) return;

    const h = await headers();
    const userAgent = h.get("user-agent");
    const rawIp =
      (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
      h.get("x-real-ip") ||
      "";
    const ipHash = rawIp ? hashIp(rawIp) : null;

    const baseRow: Record<string, any> = {
      inspection_id_bigint: numericId,
      view_type: HOMEOWNER_VIEW_TYPE,
      path: `/my-home/${token}`,
      metadata: { source: "homeowner_portal" },
    };

    // Best-effort insert; if the attribution columns don't exist, retry without.
    const { error } = await admin
      .from("inspection_view_events")
      .insert({ ...baseRow, user_agent: userAgent || null, ip_hash: ipHash });
    if (error) {
      await admin.from("inspection_view_events").insert(baseRow);
    }

    // Notify the inspector, throttled to the same 30-min session window (dedup
    // on THIS portal's opens) so a reload/return doesn't re-ping them.
    if (inspection?.inspector_id) {
      const reload = await isReportViewReload(admin, {
        inspectionId: numericId,
        ipHash,
        viewTypes: [HOMEOWNER_VIEW_TYPE],
      });
      if (!reload) {
        const property =
          clean(inspection.property_address) ||
          clean(inspection.address) ||
          "their home";
        await sendPushNotification({
          title: "Homeowner Portal Opened",
          body: `Your client opened the maintenance hub for ${property}.`,
          url: `/reports/${numericId}`,
          eventType: "homeowner_portal",
          target: "user",
          targetUserId: inspection.inspector_id,
        });
      }
    }
  } catch (error) {
    console.error("Homeowner portal view tracking error:", error);
  }
}

const STATUS_STYLE: Record<string, { bar: string; chip: string; text: string }> = {
  healthy: { bar: "bg-emerald-400", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", text: "text-emerald-300" },
  aging: { bar: "bg-amber-400", chip: "border-amber-500/40 bg-amber-500/10 text-amber-200", text: "text-amber-300" },
  "near-end": { bar: "bg-rose-400", chip: "border-rose-500/40 bg-rose-500/10 text-rose-200", text: "text-rose-300" },
  unknown: { bar: "bg-slate-500", chip: "border-[#232b38] bg-slate-700/30 text-[#8a93a3]", text: "text-[#8a93a3]" },
};

export default async function HomeownerPortal({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const sp = searchParams ? await searchParams : {};
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
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e13] px-6 text-center text-white">
        <div>
          <h1 className="text-3xl font-semibold">Home not found</h1>
          <p className="mt-3 text-[#8a93a3]">
            This homeowner link isn&apos;t valid or has expired. Please check with your inspector.
          </p>
        </div>
      </main>
    );
  }

  const inspectionId = inspection.id;
  const shareToken = clean(inspection.public_share_token) || String(inspectionId);

  // Track the open (own view_type, same 30-min session throttle for the push).
  await recordPortalView(inspection, lookup);

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
          .select("name, display_name, preferred_language")
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

  // #23 Multi-language: default to the company's language (buyer can switch);
  // translate the generated maintenance plan, equipment details, and safety
  // items in the data, and the fixed chrome via the UI dictionary.
  const explicitLang = String(sp?.lang || "").trim().toLowerCase();
  const companyLang = String(company?.preferred_language || "").toLowerCase();
  const activeLang = explicitLang || companyLang || "en";
  const isTranslated =
    Boolean(activeLang) && activeLang !== "en" && isSupportedLanguage(activeLang);

  let t = (s: any): string => (s == null ? "" : String(s));
  let uiMap: Record<string, string> = {};

  if (isTranslated) {
    const sources: string[] = [];
    for (const task of plan) sources.push(task.title, task.cadence, task.why);
    for (const e of equipment) {
      sources.push(
        equipmentName(e), clean(e.condition), clean(e.maintenance_schedule),
        clean(e.recall_awareness), clean(e.known_failure_patterns), clean(e.location),
      );
    }
    sources.push(...safetyItems);

    try {
      const tmap = await getReportTranslations(
        admin,
        inspectionId,
        activeLang,
        sources.filter(Boolean),
      );
      t = makeTranslator(tmap);
      for (const task of plan) {
        task.title = t(task.title);
        task.cadence = t(task.cadence);
        task.why = t(task.why);
      }
      for (let i = 0; i < safetyItems.length; i++) safetyItems[i] = t(safetyItems[i]);
    } catch {
      /* leave English on failure */
    }
    try {
      uiMap = await getUiTranslations(admin, activeLang, REPORT_UI_STRINGS);
    } catch {
      uiMap = {};
    }
  }
  const te = t;
  // Chrome translator (server-side, reliable) from the UI dictionary.
  const tc = makeTranslator(uiMap);

  return (
    <main className="min-h-screen bg-[#0a0e13] px-4 py-8 text-white md:px-6 md:py-12">
      {isTranslated && <UiAutoTranslate map={uiMap} />}
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex justify-end">
          <ReportLanguageSwitcher
            languages={SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, label: l.label }))}
            current={isTranslated ? activeLang : "en"}
          />
        </div>
        {/* Hero */}
        <section className="overflow-hidden rounded-2xl border border-teal-500/40 bg-gradient-to-br from-[#10151e] to-[#10151e] p-6 shadow-2xl md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-400">
            {tc("Your Home")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">{address}</h1>
          {cityLine && <p className="mt-2 text-lg text-[#8a93a3]">{cityLine}</p>}
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            {yearBuilt && (
              <span className="rounded-full border border-[#232b38] bg-black/30 px-3 py-1 text-[#8a93a3]">
                {tc("Built")} {yearBuilt}
              </span>
            )}
            {inspectedOn && (
              <span className="rounded-full border border-[#232b38] bg-black/30 px-3 py-1 text-[#8a93a3]">
                {tc("Inspected")} {inspectedOn}
              </span>
            )}
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-teal-200">
              {companyName}
            </span>
          </div>
          <p className="mt-6 max-w-2xl text-[#8a93a3]">
            {tc(
              "Welcome to your home's maintenance hub. Below are the major systems from your inspection with their expected life, plus a simple upkeep plan to keep everything running and protect your investment.",
            )}
          </p>
          <Link
            href={`/share/${shareToken}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
          >
            {tc("View your full inspection report")} →
          </Link>
        </section>

        {/* Systems & equipment */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-teal-300">{tc("Your Systems & Equipment")}</h2>
          {equipment.length === 0 ? (
            <p className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-6 text-[#8a93a3]">
              No equipment was catalogued for this home yet. Your full report has all the
              inspected details.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {equipment.map((row, i) => {
                const life = computeEquipmentLife(row, currentYear);
                const s = STATUS_STYLE[life.status];
                const name = te(equipmentName(row));
                const maker = clean(row.manufacturer);
                const recall = te(clean(row.recall_awareness));
                const known = te(clean(row.known_failure_patterns));
                const maintenance = te(clean(row.maintenance_schedule));
                return (
                  <div
                    key={row.id ?? i}
                    className="flex flex-col rounded-2xl border border-[#1a212c] bg-[#10151e] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-white">{name}</p>
                        <p className="text-xs text-[#8a93a3]">
                          {[maker, te(clean(row.location))].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>
                        {life.status === "unknown" ? tc("Info") : `${life.pctUsed}% used`}
                      </span>
                    </div>

                    {/* Life bar */}
                    {life.pctUsed != null && (
                      <div className="mt-4">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a212c]">
                          <div
                            className={`h-full rounded-full ${s.bar}`}
                            style={{ width: `${life.pctUsed}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#8a93a3]">
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

                    <p className={`mt-3 text-xs font-bold ${s.text}`}>{tc(life.statusLabel)}</p>

                    {maintenance && (
                      <p className="mt-3 border-t border-[#1a212c] pt-3 text-sm text-[#8a93a3]">
                        <span className="font-semibold text-[#e8ecf3]">{tc("Upkeep:")} </span>
                        {maintenance}
                      </p>
                    )}
                    {(recall || known) && (
                      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                        <span className="font-semibold">{tc("Worth knowing:")} </span>
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
          <h2 className="text-2xl font-semibold text-teal-300">{tc("Your Maintenance Plan")}</h2>
          <p className="text-sm text-[#8a93a3]">
            {tc(
              "Tailored to the systems in your home. A little regular upkeep prevents most expensive repairs.",
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.map((task, i) => (
              <div key={i} className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-white">{task.title}</p>
                  {task.season && (
                    <span className="shrink-0 rounded-full border border-[#232b38] bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-[#8a93a3]">
                      {tc(task.season)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-400">
                  {task.cadence}
                </p>
                <p className="mt-2 text-sm text-[#8a93a3]">{task.why}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety highlights */}
        {safetyItems.length > 0 && (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6">
            <h2 className="text-xl font-semibold text-rose-200">{tc("Safety items to prioritize")}</h2>
            <p className="mt-1 text-sm text-[#8a93a3]">
              {tc(
                "Your inspector flagged these as safety or major concerns. See your full report for the details and photos.",
              )}
            </p>
            <ul className="mt-4 space-y-2">
              {safetyItems.map((title, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#e8ecf3]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  {title}
                </li>
              ))}
            </ul>
            <Link
              href={`/share/${shareToken}`}
              className="mt-4 inline-flex text-sm font-semibold text-rose-200 underline hover:text-white"
            >
              {tc("Open the full report")} →
            </Link>
          </section>
        )}

        <footer className="border-t border-[#1a212c] pt-6 text-center text-xs text-[#59626f]">
          Prepared for you by {companyName}. This hub is a homeowner convenience — your full
          inspection report is the official document.
        </footer>
      </div>
    </main>
  );
}

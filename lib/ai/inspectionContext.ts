// =====================================================================
// CONTEXT LAYER — grounds every AI write-up in the real property + the
// live state of the current inspection.
//
// Assembles a compact "PROPERTY & INSPECTION CONTEXT" block from the
// inspection record (age, size, type, region/climate), the findings already
// documented this inspection (so the AI stays consistent and section-aware),
// and any custom context the inspector typed for this job. The FLOW Writer
// core injects it into every finding prompt, so the whole app shares one
// grounding — no per-route wiring.
//
// Server-only (service-role). Best-effort: any miss returns "" so callers
// compose unconditionally. Selects "*" on inspections so a column that does
// not exist can never error the whole query (a real bug we hit before).
// =====================================================================

import { createClient } from "@supabase/supabase-js";

function admin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function str(v: any): string {
  return v == null ? "" : String(v).trim();
}
function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Rough climate hint by U.S. state so the AI weighs region-appropriate
// conditions (ice dams vs. termites vs. shrink-swell soils). Deliberately
// coarse — a nudge, never a fact to assert.
const COLD_SNOW = new Set([
  "AK","ME","NH","VT","MA","CT","RI","NY","MI","WI","MN","ND","SD","MT","ID","WY","IA","IL","IN","OH","PA","CO","UT","NE",
]);
const HOT_HUMID = new Set(["FL","LA","MS","AL","GA","SC","TX","AR","TN","NC"]);
const ARID = new Set(["AZ","NM","NV"]);

function climateHint(state: string): string {
  const s = state.toUpperCase();
  if (!s) return "";
  if (COLD_SNOW.has(s))
    return "Cold/snow-load region — weigh ice damming, freeze protection at exterior plumbing, frost-affected grading/foundations, and heating-system condition.";
  if (HOT_HUMID.has(s))
    return "Hot/humid region — weigh moisture intrusion, mold-conducive conditions, wood-destroying-insect evidence, and cooling-system load.";
  if (ARID.has(s))
    return "Arid/high-heat region — weigh sun/UV degradation, expansive-soil movement, and cooling-system condition.";
  return "";
}

export type InspectionContext = {
  block: string; // formatted prompt block ("" when nothing useful)
  yearBuilt: number | null;
  age: number | null;
  state: string;
};

export async function loadInspectionContext(
  inspectionId: string | number | null | undefined,
): Promise<InspectionContext> {
  const empty: InspectionContext = { block: "", yearBuilt: null, age: null, state: "" };
  const db = admin();
  if (!db || inspectionId == null || inspectionId === "") return empty;

  try {
    const { data: insp } = await db
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .maybeSingle();
    if (!insp) return empty;

    const facts: string[] = [];

    const yearBuilt = num(insp.year_built);
    const nowYear = new Date().getFullYear();
    const age = yearBuilt ? nowYear - yearBuilt : null;
    if (yearBuilt) {
      facts.push(
        `Built ${yearBuilt}${age != null ? ` (~${age} years old)` : ""} — consider age-appropriate systems, materials, and wear typical of that era.`,
      );
    }

    const sqft = num(insp.square_feet) ?? num(insp.sqft);
    if (sqft) facts.push(`Approx. ${sqft.toLocaleString()} sq ft.`);

    const propertyType = str(insp.property_type || insp.building_type || insp.style);
    if (propertyType) facts.push(`Property type: ${propertyType}.`);

    const foundation = str(insp.foundation || insp.foundation_type);
    if (foundation) facts.push(`Foundation: ${foundation}.`);

    const occupancy = str(insp.occupancy);
    if (occupancy) facts.push(`Occupancy: ${occupancy}.`);

    const inspType = str(insp.inspection_type);
    if (inspType) facts.push(`Inspection type: ${inspType}.`);

    const state = str(insp.state);
    const cityState = [str(insp.city), state].filter(Boolean).join(", ");
    if (cityState) facts.push(`Location: ${cityState}.`);

    const weather = str(insp.weather_conditions || insp.weather);
    const temp = str(insp.temperature);
    if (weather || temp) {
      facts.push(
        `Conditions at inspection: ${[weather, temp && `${temp}°`].filter(Boolean).join(", ")}.`,
      );
    }

    const climate = climateHint(state);
    if (climate) facts.push(climate);

    // Custom, inspector-authored context for THIS job (if the column exists).
    const custom = str(insp.ai_context_notes || insp.ai_context);
    if (custom) facts.push(`Inspector-provided context: ${custom}`);

    // Live state of the current inspection: what has already been documented,
    // so the AI stays consistent and section-aware and avoids duplicating.
    let coverage = "";
    try {
      const { data: findings } = await db
        .from("findings")
        .select("section,severity,title")
        .eq("inspection_id", inspectionId)
        .limit(200);
      const rows = (findings as any[]) || [];
      if (rows.length) {
        const sections = Array.from(
          new Set(rows.map((r) => str(r.section)).filter(Boolean)),
        );
        const recent = rows
          .slice(-6)
          .map((r) => str(r.title))
          .filter(Boolean);
        coverage =
          `Already documented this inspection: ${rows.length} finding(s)` +
          (sections.length ? `; sections covered: ${sections.join(", ")}` : "") +
          (recent.length ? `; recent: ${recent.join("; ")}` : "") +
          `. Do not duplicate an existing finding; keep wording/severity consistent with the above.`;
      }
    } catch {
      coverage = "";
    }

    if (!facts.length && !coverage) return { ...empty, yearBuilt, age, state };

    const block = [
      "PROPERTY & INSPECTION CONTEXT (grounding only — use it to make the finding more relevant and accurate; never assert a condition you cannot actually see or that the note does not support):",
      ...facts.map((f) => `- ${f}`),
      coverage ? `- ${coverage}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { block, yearBuilt, age, state };
  } catch {
    return empty;
  }
}

// "Common Ground" engine. Classifies findings into canonical defect types and
// rolls up prevalence ("% of homes with this issue") national + per-state. The
// rollup recomputes from ALL findings each run, so the numbers keep adjusting
// as more inspections are logged — it's ever-learning by construction.
//
// Server-only (service-role). The cron calls recomputeDealPrevalence(); the
// report renderer calls getPrevalenceMap()/buildCommonGround().

import { classifyDefect, catalogEntry, regionalCost, EASE_LABEL, type RepairEase } from "./dealCatalog";
import { classifyFindingsWithAI } from "./ai/classifyDefectType";

// Only show percentages once enough homes have been inspected in scope, so we
// never publish a noisy stat off 2-3 inspections. This is the denominator gate
// (homes inspected), which grows over time — start modest, raise as volume grows.
export const MIN_SAMPLE = 10;

export type PrevTier = "common" | "typical" | "uncommon" | "rare";

export function tierForPct(pct: number): PrevTier {
  if (pct >= 0.4) return "common";
  if (pct >= 0.15) return "typical";
  if (pct >= 0.05) return "uncommon";
  return "rare";
}

function normState(v: any): string {
  return String(v || "").trim().toUpperCase();
}

// ---------------------------------------------------------------------
// Recompute — classify new findings, then roll up prevalence from scratch.
// ---------------------------------------------------------------------
export async function recomputeDealPrevalence(
  admin: any,
  opts: { reclassify?: boolean } = {},
): Promise<{
  classified: number;
  types: number;
  homesTotal: number;
  rows: number;
}> {
  // 1. Published inspections (the universe) + their state.
  const { data: inspRows } = await admin
    .from("inspections")
    .select("id, state")
    .eq("published", true)
    .limit(100000);
  const inspections = (inspRows as any[]) || [];
  if (!inspections.length) return { classified: 0, types: 0, homesTotal: 0, rows: 0 };

  const stateById = new Map<string, string>();
  const stateTotals = new Map<string, number>();
  for (const i of inspections) {
    const st = normState(i.state);
    stateById.set(String(i.id), st);
    if (st) stateTotals.set(st, (stateTotals.get(st) || 0) + 1);
  }
  const publishedIds = inspections.map((i) => i.id);
  const nationalTotal = inspections.length;

  // 2. Classify findings on published inspections. Normally only the ones not
  //    classified yet (non-matches stamped "_unmatched" so we skip them nightly);
  //    with reclassify:true, re-run every finding (used when the catalog changes).
  let classified = 0;
  let q = admin
    .from("findings")
    .select("id, title, observation, section")
    .in("inspection_id", publishedIds)
    .limit(20000);
  if (!opts.reclassify) q = q.is("defect_type", null);
  const { data: unclassified } = await q;
  const toClassify = (unclassified as any[]) || [];
  if (toClassify.length) {
    // AI-tag each finding to a catalog defect type (semantic match), which
    // covers far more real findings than keyword aliases. Fall back to the
    // keyword classifier when the AI declines or is unavailable, so a missing
    // OpenAI key never regresses classification.
    let aiKeys: (string | null)[] = [];
    try {
      aiKeys = await classifyFindingsWithAI(toClassify);
    } catch {
      aiKeys = [];
    }
    for (let i = 0; i < toClassify.length; i++) {
      const f = toClassify[i];
      const key = aiKeys[i] || classifyDefect(f);
      await admin
        .from("findings")
        .update({ defect_type: key || "_unmatched" })
        .eq("id", f.id);
      if (key) classified += 1;
    }
  }

  // 3. Roll up prevalence from all classified findings on published inspections.
  const { data: cf } = await admin
    .from("findings")
    .select("inspection_id, defect_type")
    .in("inspection_id", publishedIds)
    .not("defect_type", "is", null)
    .neq("defect_type", "_unmatched")
    .limit(200000);

  const nationalSets = new Map<string, Set<string>>();
  const stateSets = new Map<string, Set<string>>(); // `${type}|${state}`
  for (const f of (cf as any[]) || []) {
    const type = f.defect_type as string;
    const iid = String(f.inspection_id);
    if (!nationalSets.has(type)) nationalSets.set(type, new Set());
    nationalSets.get(type)!.add(iid);
    const st = stateById.get(iid);
    if (st) {
      const k = `${type}|${st}`;
      if (!stateSets.has(k)) stateSets.set(k, new Set());
      stateSets.get(k)!.add(iid);
    }
  }

  const rows: any[] = [];
  const now = new Date().toISOString();
  for (const [type, set] of nationalSets) {
    rows.push({
      defect_type: type, scope: "national", scope_value: "US",
      homes_with: set.size, homes_total: nationalTotal,
      pct: nationalTotal ? set.size / nationalTotal : null, updated_at: now,
    });
  }
  for (const [k, set] of stateSets) {
    const [type, st] = k.split("|");
    const tot = stateTotals.get(st) || 0;
    rows.push({
      defect_type: type, scope: "state", scope_value: st,
      homes_with: set.size, homes_total: tot,
      pct: tot ? set.size / tot : null, updated_at: now,
    });
  }

  // Replace the table wholesale so the numbers always reflect the latest data.
  try {
    await admin.from("defect_prevalence").delete().neq("defect_type", "___never___");
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from("defect_prevalence").insert(rows.slice(i, i + 500));
    }
  } catch {
    /* best-effort */
  }

  return { classified, types: nationalSets.size, homesTotal: nationalTotal, rows: rows.length };
}

// ---------------------------------------------------------------------
// Read side — prevalence map + per-finding Common Ground data for the report.
// ---------------------------------------------------------------------
export type PrevalenceEntry = {
  national: { pct: number; homesWith: number; homesTotal: number } | null;
  local: { pct: number; homesWith: number; homesTotal: number; state: string } | null;
};

// Load prevalence for a set of defect types (national + the inspection's state).
export async function getPrevalenceMap(
  admin: any,
  defectTypes: string[],
  state: string | null | undefined,
): Promise<Record<string, PrevalenceEntry>> {
  const types = Array.from(new Set(defectTypes.filter(Boolean)));
  const map: Record<string, PrevalenceEntry> = {};
  if (!types.length) return map;
  const st = normState(state);

  try {
    const { data } = await admin
      .from("defect_prevalence")
      .select("defect_type, scope, scope_value, homes_with, homes_total, pct")
      .in("defect_type", types);
    for (const r of (data as any[]) || []) {
      const e = (map[r.defect_type] = map[r.defect_type] || { national: null, local: null });
      const rec = {
        pct: Number(r.pct) || 0,
        homesWith: Number(r.homes_with) || 0,
        homesTotal: Number(r.homes_total) || 0,
      };
      if (r.scope === "national") e.national = rec;
      else if (r.scope === "state" && st && r.scope_value === st) {
        e.local = { ...rec, state: st };
      }
    }
  } catch {
    return {};
  }
  return map;
}

export type CommonGround = {
  tier: PrevTier;
  national: { pct: number; enough: boolean } | null;
  local: { pct: number; state: string; enough: boolean } | null;
  ease: { tier: RepairEase; label: string };
  cost: { low: number; high: number; region: string | null };
  repairNote: string;
  standsOut: boolean; // rare + serious => the negotiation item
  label: string;
};

const SERIOUS = /safety|major/i;

// Build the panel data for one finding. Returns null when there's no classified
// defect type or not enough data to show a number.
export function buildCommonGround(
  finding: { defect_type?: string | null; severity?: string | null },
  prevMap: Record<string, PrevalenceEntry>,
  state?: string | null,
): CommonGround | null {
  const key = finding.defect_type;
  if (!key || key === "_unmatched") return null;
  const cat = catalogEntry(key);
  if (!cat) return null;

  const entry = prevMap[key];
  const nat = entry?.national;
  // Need at least a national number with a real sample to show the panel.
  if (!nat || nat.homesTotal < MIN_SAMPLE) return null;

  const local = entry?.local && entry.local.homesTotal >= MIN_SAMPLE ? entry.local : null;
  const tier = tierForPct(nat.pct);
  const serious = SERIOUS.test(String(finding.severity || ""));

  // Scale the national cost range to the property's area so the estimate is
  // relevant to where the home actually is.
  const cost = regionalCost(cat.costLow, cat.costHigh, state ?? local?.state ?? null);

  return {
    tier,
    national: { pct: nat.pct, enough: true },
    local: local ? { pct: local.pct, state: local.state, enough: true } : null,
    ease: { tier: cat.ease, label: EASE_LABEL[cat.ease] },
    cost: { low: cost.low, high: cost.high, region: cost.region },
    repairNote: cat.repairNote,
    standsOut: tier === "rare" && serious,
    label: cat.label,
  };
}

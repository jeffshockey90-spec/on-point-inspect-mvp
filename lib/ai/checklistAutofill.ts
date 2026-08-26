// Maps AI equipment-capture attributes -> a report section's "system info"
// checklist fields (the section_checklist_selections table). Accuracy-first:
// only proposes a field when the AI actually read a value, snaps values to the
// real option lists, and falls back to a custom "OTHER" value (in the correct
// section) when the AI reads something not yet in the list — never a wrong match.
//
// Phase 1 covers equipment sections (water heater, electrical panel, heating,
// cooling). The option lists below MUST mirror CHECKLIST_LIBRARY in
// components/SectionInformationChecklist.tsx.

export type ChecklistFill = {
  section: string;      // report section, e.g. "Plumbing"
  groupTitle: string;   // checklist group, e.g. "Water Heater Manufacturer"
  kind: "option" | "text";
  value: string;        // option label (matched) or the raw read value / number
  matched: boolean;     // true when value is a built-in option; false -> stored as OTHER
  unit?: string;        // for text fields, e.g. "gallons"
};

// --- Option lists (kept in sync with SectionInformationChecklist.tsx) ---
const WH_MANUFACTURER = ["Ecosmart", "Heat Pump", "Rinnai", "GE", "State", "Whirlpool", "AO Smith", "Kenmore", "Rheem", "Bradford & White", "MayTag"];
const WH_POWER = ["Electric", "Solar", "Indirect", "Gas", "Propane", "Tankless"];
const PANEL_MANUFACTURER = ["Challenger", "Federal Pioneer", "Cutler Hammer", "Gould", "Murray", "Siemens", "T&B", "Westinghouse", "Bryant", "Crouse-Hinds", "General Switch", "Federal Pacific", "ITE", "Square D", "General Electric", "Walker"];
const PANEL_CAPACITY = ["60 AMP", "100 AMP", "125 AMP", "150 AMP", "200 AMP", "225 AMP", "400 AMP", "800 AMP"];
const HEATING_ENERGY = ["Coal", "Gas", "Oil", "Solar", "Natural Gas", "Corn", "Kerosene", "Propane", "Electric", "Wood"];
const COOLING_ENERGY = ["Ceiling Fan", "Whole House Fan", "Window AC", "Heat Pump", "Oil", "Gas", "Electric", "Central Air Conditioner", "Swamp Cooler", "Attic Fan"];

const UNKNOWN_VALUES = new Set([
  "unknown", "n/a", "na", "not available", "not visible", "not readable",
  "unreadable", "unable to determine", "unable to confirm", "cannot determine",
  "not determined", "none", "tbd", "-", "—",
]);

function isKnown(value: unknown): boolean {
  const clean = String(value ?? "").trim();
  if (!clean) return false;
  return !UNKNOWN_VALUES.has(clean.toLowerCase());
}

function normKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Exact (normalized) option match, else null.
function matchOption(value: string, options: string[]): string | null {
  const vk = normKey(value);
  if (!vk) return null;
  for (const opt of options) if (normKey(opt) === vk) return opt;
  return null;
}

// Fuel/energy matching with word-level fallbacks (e.g. "natural gas" -> "Gas"
// when the option set only has "Gas").
function matchFuel(value: string, options: string[]): string | null {
  const direct = matchOption(value, options);
  if (direct) return direct;
  const v = value.toLowerCase();
  const pick = (label: string) => options.find((o) => o.toLowerCase() === label) || null;
  if (v.includes("heat pump")) return pick("heat pump");
  if (v.includes("propane") || v.includes(" lp")) return pick("propane");
  if (v.includes("natural gas")) return pick("natural gas") || pick("gas");
  if (v.includes("gas")) return pick("gas") || pick("natural gas");
  if (v.includes("electric")) return pick("electric");
  if (v.includes("oil")) return pick("oil");
  if (v.includes("solar")) return pick("solar");
  if (v.includes("kerosene")) return pick("kerosene");
  if (v.includes("wood")) return pick("wood");
  return null;
}

function firstNumber(value: unknown): string {
  const m = String(value ?? "").match(/\d+(?:\.\d+)?/);
  return m ? m[0] : "";
}

type Attrs = Record<string, any>;

function equipText(er: Attrs) {
  return [er.equipmentType, er.equipmentCategory, er.manufacturer, er.model, er.section, er.clientSummary]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
}

function isWaterHeater(t: string) {
  return t.includes("water heater") || t.includes("tankless") || t.includes("hot water");
}
function isPanel(t: string) {
  return t.includes("electrical panel") || t.includes("breaker panel") || t.includes("panelboard") || t.includes("service panel") || t.includes("load center");
}
function isHeating(t: string) {
  return t.includes("furnace") || t.includes("boiler") || t.includes("air handler") || t.includes("heat pump") || t.includes("heating");
}
function isCooling(t: string) {
  return t.includes("condenser") || t.includes("air conditioner") || t.includes("central air") || t.includes(" ac ") || t.includes("cooling") || t.includes("evaporative") || t.includes("swamp");
}

function optionFill(section: string, groupTitle: string, raw: string, options: string[]): ChecklistFill {
  const matched = matchOption(raw, options);
  return { section, groupTitle, kind: "option", value: matched || raw.trim(), matched: Boolean(matched) };
}

// Builds the proposed section-info fills from an equipment capture result.
// Only includes fields the AI actually read (isKnown).
export function buildEquipmentFills(er: Attrs): ChecklistFill[] {
  if (!er || typeof er !== "object") return [];
  const t = equipText(er);
  const fills: ChecklistFill[] = [];

  if (isWaterHeater(t)) {
    if (isKnown(er.manufacturer)) fills.push(optionFill("Plumbing", "Water Heater Manufacturer", String(er.manufacturer), WH_MANUFACTURER));
    if (isKnown(er.fuelType)) {
      const opt = matchFuel(String(er.fuelType), WH_POWER);
      if (opt) fills.push({ section: "Plumbing", groupTitle: "Water Heater Power Source/Type", kind: "option", value: opt, matched: true });
      else fills.push({ section: "Plumbing", groupTitle: "Water Heater Power Source/Type", kind: "option", value: String(er.fuelType).trim(), matched: false });
    }
    const cap = firstNumber(er.capacity);
    if (cap) fills.push({ section: "Plumbing", groupTitle: "Water Heater Capacity", kind: "text", value: cap, matched: false, unit: "gallons" });
    return fills;
  }

  if (isPanel(t)) {
    if (isKnown(er.manufacturer)) fills.push(optionFill("Electrical", "Panel Manufacturer", String(er.manufacturer), PANEL_MANUFACTURER));
    const amps = firstNumber(er.capacity || er.estimatedBTU);
    if (amps) {
      const cand = `${parseInt(amps, 10)} AMP`;
      fills.push({ section: "Electrical", groupTitle: "Panel Capacity", kind: "option", value: cand, matched: PANEL_CAPACITY.includes(cand) });
    }
    return fills;
  }

  // Heat pumps read as both — route by the analyzer's chosen section.
  const preferCooling = String(er.section || "").toLowerCase() === "cooling";
  if (isCooling(t) && (preferCooling || !isHeating(t))) {
    let typeOpt: string | null = null;
    if (t.includes("central air")) typeOpt = "Central Air Conditioner";
    else if (t.includes("heat pump")) typeOpt = "Heat Pump";
    else if (t.includes("window")) typeOpt = "Window AC";
    else if (t.includes("swamp") || t.includes("evaporative")) typeOpt = "Swamp Cooler";
    else if (isKnown(er.fuelType)) typeOpt = matchFuel(String(er.fuelType), COOLING_ENERGY);
    if (typeOpt) fills.push({ section: "Cooling", groupTitle: "Energy Source/Type", kind: "option", value: typeOpt, matched: true });
    return fills;
  }

  if (isHeating(t)) {
    if (isKnown(er.fuelType)) {
      const opt = matchFuel(String(er.fuelType), HEATING_ENERGY);
      if (opt) fills.push({ section: "Heating", groupTitle: "Energy Source", kind: "option", value: opt, matched: true });
      else fills.push({ section: "Heating", groupTitle: "Energy Source", kind: "option", value: String(er.fuelType).trim(), matched: false });
    }
    return fills;
  }

  return fills;
}

// Writes confirmed fills to section_checklist_selections. Fills only EMPTY
// groups by default — never overwrites a selection the inspector already made.
// Values not in the option list are stored as custom "OTHER" rows (in the
// correct section), so nothing the AI reads is lost or mismatched.
export async function writeChecklistFills(
  supabase: any,
  inspectionId: string,
  fills: ChecklistFill[],
  opts: { overwrite?: boolean } = {},
): Promise<number> {
  if (!inspectionId || !Array.isArray(fills) || fills.length === 0) return 0;
  let written = 0;

  for (const f of fills) {
    if (!f?.section || !f?.groupTitle || !String(f.value || "").trim()) continue;

    if (!opts.overwrite) {
      const { data: existing } = await supabase
        .from("section_checklist_selections")
        .select("id")
        .eq("inspection_id", inspectionId)
        .eq("section", f.section)
        .eq("group_title", f.groupTitle)
        .limit(1);
      if (existing && existing.length > 0) continue; // don't overwrite the inspector
    }

    let row: Record<string, any>;
    if (f.kind === "text") {
      row = { inspection_id: inspectionId, section: f.section, group_title: f.groupTitle, value: "__TEXT_VALUE__", custom_text: f.value };
    } else if (f.matched) {
      row = { inspection_id: inspectionId, section: f.section, group_title: f.groupTitle, value: f.value };
    } else {
      row = { inspection_id: inspectionId, section: f.section, group_title: f.groupTitle, value: "OTHER", custom_text: f.value };
    }

    const { error } = await supabase.from("section_checklist_selections").insert(row);
    if (!error) written += 1;
  }

  return written;
}

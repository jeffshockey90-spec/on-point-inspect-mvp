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
    const seer = er.estimatedSEER || er.seer || er.SEER;
    if (isKnown(seer)) {
      fills.push({ section: "Cooling", groupTitle: "SEER Rating", kind: "text", value: String(seer).trim(), matched: false });
    }
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

// --- Phase 2: material/type fields identified visually from a Finding photo ---
// section -> the checklist groups the AI can fill by identifying the material.
// Option lists MIRROR CHECKLIST_LIBRARY in SectionInformationChecklist.tsx.
export const MATERIAL_FIELDS: Record<string, { groupTitle: string; options: string[] }[]> = {
  "Exterior": [
    { groupTitle: "Siding Material", options: ["Brick Veneer", "Plastic", "Logs", "Stone Veneer", "Concrete", "Stucco", "Fiber Cement", "Stone", "Wood", "Vinyl", "Shingles", "Brick", "Engineered Wood", "Masonry", "Asphalt", "Metal"] },
    { groupTitle: "Exterior Entry Door", options: ["Wood", "Steel", "Single Pane", "Glass", "Hollow Core", "Fiberglass"] },
    { groupTitle: "Appurtenance Material", options: ["Composite", "Wood", "Concrete", "Masonry"] },
    { groupTitle: "Driveway Material", options: ["Concrete", "Asphalt", "Cobblestone", "Pavers", "Gravel", "Brick", "Street Parking", "Dirt"] },
  ],
  "Roof": [
    { groupTitle: "Roof Type/Style", options: ["Gambrel", "Combination", "Hip", "Mansard", "Shed", "Gable", "Flat"] },
    { groupTitle: "Roof Covering Material", options: ["Solar", "Ceramic", "Asbestos", "Tile", "Metal", "Concrete", "Fiberglass", "Slate", "Asphalt", "Wood"] },
    { groupTitle: "Gutter Material", options: ["Aluminum", "Copper", "Vinyl", "Steel", "Seamless Aluminum", "None"] },
    { groupTitle: "Flashing Material", options: ["Aluminum", "Lead", "Foam", "Asphalt", "Copper", "Rubber"] },
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    { groupTitle: "Foundation Material", options: ["Brick", "Concrete", "Rock", "Pier and Beam", "Stone", "Masonry Block", "Slab on Grade"] },
    { groupTitle: "Basement/Crawlspace Floor", options: ["Concrete", "Wood", "Vapor Barrier", "Dirt", "Gravel"] },
    { groupTitle: "Structure Material", options: ["Wood Beams", "Slab", "Wood I-Joists", "Steel I-Beams", "CMU", "Concrete", "Steel Joists", "Engineered Floor Trusses", "Inaccessible"] },
    { groupTitle: "Sub-Floor", options: ["Inaccessible", "Plank", "OSB", "Plywood"] },
  ],
  "Plumbing": [
    { groupTitle: "Water Supply Material", options: ["Copper", "PVC", "Hose", "Poly", "Galvanized", "Unknown", "Pex"] },
    { groupTitle: "Distribution Material", options: ["Copper", "Galvanized", "Pex", "Unknown", "PVC", "Hose", "Poly"] },
    { groupTitle: "Drain Material", options: ["ABS", "Copper", "PVC", "Lead", "Iron", "Unknown"] },
  ],
  "Electrical": [
    { groupTitle: "Panel Type", options: ["Circuit Breaker", "Fuses"] },
    { groupTitle: "Wiring Method", options: ["Conduit", "Not Visible", "Surface Mounted Distribution", "Knob & Tube", "Romex"] },
    { groupTitle: "Branch Wire 15 and 20 AMP", options: ["Aluminum", "Copper"] },
  ],
  "Attic, Insulation & Ventilation": [
    { groupTitle: "Insulation Type", options: ["Batt", "Foam-board", "Fiberglass", "Cellulose", "None", "Vermiculite", "Blown", "Foiled-faced", "Loose-fill", "Mineral Wool", "Spray Foam", "Unknown"] },
    { groupTitle: "Ventilation Type", options: ["Gable Vents", "Passive", "Soffit Vents", "Turbines", "Attic Fan", "None Found", "Ridge Vents", "Thermostatically Controlled Fan", "Whole House Fan"] },
    { groupTitle: "Dryer Vent", options: ["Metal", "None Found", "Rigid PVC", "Plastic (Flex)", "Metal (Flex)", "Unknown", "Vinyl (Flex)"] },
  ],
  "Doors, Windows & Interior": [
    { groupTitle: "Interior Doors", options: ["Wood", "Hollow Core", "Metal"] },
    { groupTitle: "Window Type", options: ["Casement", "Single Pane", "Sliders", "Storm", "Drop-down", "Single-hung", "Double-hung", "Thermal"] },
    { groupTitle: "Floor Coverings", options: ["Bamboo", "Carpet", "Engineered Wood", "Laminate", "Tile", "Brick", "Concrete", "Hardwood", "Linoleum", "Vinyl"] },
    { groupTitle: "Wall Material", options: ["Brick", "Paneling", "Wood", "Tile", "Compressed Board", "Drywall", "Plaster", "Gypsum Board", "Unfinished", "Wallpaper"] },
    { groupTitle: "Ceiling Material", options: ["Ceiling Tiles", "Gypsum Board", "Popcorn", "Unfinished", "Wood", "Compressed Board", "Plaster", "Suspended Ceiling Panels", "Wallpaper", "Drywall"] },
    { groupTitle: "Cabinetry", options: ["Laminate", "Plastic", "Metal", "Wood"] },
    { groupTitle: "Countertop Material", options: ["Composite", "Concrete", "Granite", "Metal", "Quartz", "Stainless Steel", "Wood Butcher Block", "Laminate", "Corian", "Marble", "Porcelain", "Recycled Glass", "Tile"] },
  ],
  "Built-in Appliances": [
    { groupTitle: "Range/Oven Energy Source", options: ["Coal", "Gas", "Electric", "Wood"] },
    { groupTitle: "Exhaust Hood Type", options: ["None", "Vented", "Re-circulate"] },
  ],
  "Garage": [
    { groupTitle: "Garage Door Material", options: ["Aluminum", "Wood Composite", "Vinyl", "Insulated", "Steel", "Wood", "Fiberglass", "Glass"] },
    { groupTitle: "Garage Door Type", options: ["Sliding", "Up-and-Over", "Automatic", "Folding", "Roll-Up", "Sectional"] },
  ],
};

// Maps the AI's visually-identified material values (sectionInfo, keyed by
// group title, returned by /api/ai-capture) to checklist fills for that section.
export function buildMaterialFills(section: string, sectionInfo: Record<string, any> | null | undefined): ChecklistFill[] {
  if (!section || !sectionInfo || typeof sectionInfo !== "object") return [];
  const groups = MATERIAL_FIELDS[section];
  if (!groups) return [];
  const fills: ChecklistFill[] = [];
  for (const g of groups) {
    const raw = sectionInfo[g.groupTitle];
    if (!isKnown(raw)) continue;
    fills.push(optionFill(section, g.groupTitle, String(raw), g.options));
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

// Canonical defect catalog powering "Common Ground" (#deal-insights).
//
// Each entry is a canonical defect type a finding gets classified into. This
// gives three things at once:
//   1. a stable key to COUNT prevalence across inspections (free text can't be
//      counted; "double tapped breaker" and "double-tap on breaker" must map to
//      the same key),
//   2. an ease-of-repair tier + note (client-facing),
//   3. a typical cost range (rough U.S. figures; the inspector can hide these).
//
// Client-safe (no secrets). Keyword/alias matching keeps classification
// deterministic and free; the aliases are matched against the finding's
// title + observation, lowercased.

export type RepairEase = "diy" | "handyman" | "pro" | "licensed" | "specialist";

export const EASE_LABEL: Record<RepairEase, string> = {
  diy: "Simple DIY",
  handyman: "Handyman / DIY",
  pro: "Qualified contractor",
  licensed: "Licensed trade",
  specialist: "Specialist evaluation",
};

export type DefectCatalogEntry = {
  key: string;
  label: string;
  section: string;
  aliases: string[]; // lowercased phrases; matched against title+observation
  ease: RepairEase;
  costLow: number;
  costHigh: number;
  repairNote: string;
};

// Ordered most-specific first where it matters (e.g. Federal Pacific before a
// generic panel note) so the first alias match wins.
export const DEFECT_CATALOG: DefectCatalogEntry[] = [
  // ---- Electrical ----
  { key: "fpe_panel", label: "Federal Pacific / Stab-Lok panel", section: "Electrical",
    aliases: ["federal pacific", "stab-lok", "stab lok", "fpe panel"], ease: "licensed",
    costLow: 1800, costHigh: 3000, repairNote: "Panel replacement is a permitted job for a licensed electrician, usually a half-day with sign-off." },
  { key: "zinsco_panel", label: "Zinsco / Sylvania panel", section: "Electrical",
    aliases: ["zinsco", "sylvania panel"], ease: "licensed",
    costLow: 1800, costHigh: 3000, repairNote: "Recommend evaluation and likely replacement by a licensed electrician." },
  { key: "double_tapped_breaker", label: "Double-tapped breaker", section: "Electrical",
    aliases: ["double tap", "double-tap", "double lugged", "two wires under one breaker"], ease: "licensed",
    costLow: 150, costHigh: 350, repairNote: "A quick correction for a licensed electrician — separate the conductors or add a breaker." },
  { key: "missing_gfci", label: "Missing GFCI protection", section: "Electrical",
    aliases: ["gfci", "ground fault", "no gfci"], ease: "licensed",
    costLow: 20, costHigh: 250, repairNote: "Add GFCI protection at the affected locations." },
  { key: "missing_afci", label: "Missing AFCI protection", section: "Electrical",
    aliases: ["afci", "arc fault"], ease: "licensed",
    costLow: 40, costHigh: 300, repairNote: "Add AFCI protection where required by a licensed electrician." },
  { key: "open_ground_reversed_polarity", label: "Open ground / reversed polarity", section: "Electrical",
    aliases: ["open ground", "reversed polarity", "reverse polarity", "ungrounded receptacle"], ease: "licensed",
    costLow: 100, costHigh: 400, repairNote: "Correction of wiring at the affected receptacles by a licensed electrician." },
  { key: "open_knockouts_panel", label: "Open knockouts / missing blanks", section: "Electrical",
    aliases: ["open knockout", "missing blank", "missing knockout", "unused opening"], ease: "handyman",
    costLow: 5, costHigh: 40, repairNote: "Install the correct filler plates/blanks to close the openings." },
  { key: "exposed_wiring", label: "Exposed / improperly spliced wiring", section: "Electrical",
    aliases: ["exposed wire", "open splice", "improper splice", "junction box missing", "unprotected wiring"], ease: "licensed",
    costLow: 150, costHigh: 600, repairNote: "Contain and protect the wiring in an approved junction box by a licensed electrician." },

  // ---- Plumbing ----
  { key: "missing_tpr_discharge", label: "Missing / short TPR discharge pipe", section: "Plumbing",
    aliases: ["tpr", "temperature and pressure relief", "discharge pipe", "relief valve pipe"], ease: "handyman",
    costLow: 40, costHigh: 150, repairNote: "Add a proper discharge pipe to within ~6 inches of the floor." },
  { key: "active_leak", label: "Active plumbing leak", section: "Plumbing",
    aliases: ["active plumbing leak", "leaking pipe", "leaking supply", "leaking drain", "leak under the sink", "leak at the fitting", "supply line leak"], ease: "pro",
    costLow: 150, costHigh: 800, repairNote: "Repair by a qualified plumber; document any resulting damage." },
  { key: "corroded_supply", label: "Corroded / mixed-metal connections", section: "Plumbing",
    aliases: ["corroded pipe", "corroded fitting", "corroded connection", "dielectric union", "mixed metal", "galvanic corrosion"], ease: "pro",
    costLow: 150, costHigh: 500, repairNote: "Replace corroded fittings; add dielectric unions where dissimilar metals meet." },
  { key: "water_heater_age", label: "Water heater at/near end of life", section: "Plumbing",
    aliases: ["water heater", "end of service life water heater", "aged water heater"], ease: "pro",
    costLow: 1200, costHigh: 2200, repairNote: "Budget for replacement by a qualified plumber." },
  { key: "poly_b", label: "Polybutylene supply piping", section: "Plumbing",
    aliases: ["polybutylene", "poly-b", "poly b", "quest pipe"], ease: "pro",
    costLow: 4000, costHigh: 10000, repairNote: "Known failure-prone piping; recommend evaluation and whole-home replacement planning." },

  // ---- Roof ----
  { key: "active_roof_leak", label: "Active roof leak / water intrusion", section: "Roof",
    aliases: ["roof leak", "roof is leaking", "leak in the roof", "active leak at the roof", "ceiling stain from roof", "water staining at the ceiling", "roof water intrusion"], ease: "pro",
    costLow: 3000, costHigh: 8000, repairNote: "Evaluation and repair by a qualified roofer before closing." },
  { key: "damaged_missing_shingles", label: "Damaged / missing shingles", section: "Roof",
    aliases: ["missing shingle", "damaged shingle", "lifted shingle", "curling shingle"], ease: "pro",
    costLow: 300, costHigh: 1500, repairNote: "Repair or replace affected roofing by a qualified roofer." },
  { key: "aging_roof", label: "Aging roof covering", section: "Roof",
    aliases: ["granule loss", "aged roof", "roof near end", "worn shingles", "end of roof life"], ease: "pro",
    costLow: 6000, costHigh: 14000, repairNote: "Monitor; budget for replacement as the covering reaches end of life." },
  { key: "flashing_deficiency", label: "Flashing deficiency", section: "Roof",
    aliases: ["flashing", "kickout", "step flashing", "missing flashing"], ease: "pro",
    costLow: 200, costHigh: 900, repairNote: "Correct or add flashing by a qualified roofer." },
  { key: "clogged_gutters", label: "Gutters / downspouts need attention", section: "Roof",
    aliases: ["gutter", "downspout", "clogged gutter"], ease: "handyman",
    costLow: 100, costHigh: 400, repairNote: "Clean and secure gutters; extend downspouts away from the foundation." },

  // ---- Exterior ----
  { key: "negative_grading", label: "Negative grading toward foundation", section: "Exterior",
    aliases: ["negative grading", "grading toward", "slope toward foundation", "grading"], ease: "handyman",
    costLow: 200, costHigh: 1200, repairNote: "Re-grade to direct water away from the home — the cheapest protection there is." },
  { key: "missing_handrail", label: "Missing / loose handrail or guard", section: "Exterior",
    aliases: ["handrail", "hand rail", "guardrail", "guard rail", "missing rail"], ease: "handyman",
    costLow: 150, costHigh: 600, repairNote: "Add or secure a graspable handrail / proper guard." },
  { key: "deteriorated_sealant", label: "Deteriorated caulking / sealant", section: "Exterior",
    aliases: ["caulk", "sealant", "deteriorated seal"], ease: "handyman",
    costLow: 50, costHigh: 300, repairNote: "Reseal exposed joints and penetrations." },
  { key: "siding_trim_damage", label: "Damaged siding / trim", section: "Exterior",
    aliases: ["siding", "trim damage", "rotted trim", "damaged siding"], ease: "pro",
    costLow: 200, costHigh: 1500, repairNote: "Repair or replace affected siding/trim by a qualified contractor." },
  { key: "deck_ledger_guard", label: "Deck ledger / guard concern", section: "Exterior",
    aliases: ["deck ledger", "deck attachment", "deck guard", "deck rail"], ease: "pro",
    costLow: 300, costHigh: 2000, repairNote: "Evaluation and correction of the deck attachment/guards by a qualified contractor." },

  // ---- Heating ----
  { key: "furnace_end_of_life", label: "Furnace at/near end of life", section: "Heating",
    aliases: ["furnace end of life", "aged furnace", "furnace near end"], ease: "specialist",
    costLow: 3500, costHigh: 6500, repairNote: "Have an HVAC contractor evaluate; budget for replacement." },
  { key: "heat_exchanger_concern", label: "Heat exchanger concern", section: "Heating",
    aliases: ["heat exchanger", "cracked heat exchanger"], ease: "specialist",
    costLow: 500, costHigh: 3000, repairNote: "Immediate evaluation by an HVAC contractor for safety." },
  { key: "flue_venting_defect", label: "Improper flue / venting", section: "Heating",
    aliases: ["flue", "venting", "disconnected vent", "improper vent"], ease: "specialist",
    costLow: 200, costHigh: 900, repairNote: "Correct the venting by a qualified HVAC contractor — a combustion-safety item." },
  { key: "hvac_service_due", label: "Heating service overdue", section: "Heating",
    aliases: ["service overdue", "dirty furnace", "needs servicing heating", "no service record"], ease: "pro",
    costLow: 120, costHigh: 300, repairNote: "Schedule routine servicing by an HVAC contractor." },

  // ---- Cooling ----
  { key: "ac_end_of_life", label: "A/C at/near end of service life", section: "Cooling",
    aliases: ["condenser", "air conditioner end", "ac end of life", "aged ac", "compressor near end"], ease: "specialist",
    costLow: 5500, costHigh: 7500, repairNote: "Have an HVAC contractor evaluate; budget for replacement." },
  { key: "dirty_ac_coils", label: "Dirty / damaged A/C coils or fins", section: "Cooling",
    aliases: ["dirty coil", "bent fins", "damaged coil", "condenser fins"], ease: "pro",
    costLow: 120, costHigh: 400, repairNote: "Clean/straighten and service by an HVAC contractor." },
  { key: "missing_condensate_mgmt", label: "Missing condensate management", section: "Cooling",
    aliases: ["condensate", "no drain pan", "float switch", "condensate line"], ease: "pro",
    costLow: 100, costHigh: 400, repairNote: "Add proper condensate drainage / safety switch." },

  // ---- Basement, Foundation, Crawlspace & Structure ----
  { key: "foundation_water", label: "Water intrusion at foundation / basement", section: "Basement, Foundation, Crawlspace & Structure",
    aliases: ["water intrusion foundation", "basement moisture", "efflorescence", "water penetration", "wet basement"], ease: "specialist",
    costLow: 1500, costHigh: 8000, repairNote: "Evaluate the source and drainage; specialist repair may be warranted." },
  { key: "foundation_crack_structural", label: "Structural foundation crack / movement", section: "Basement, Foundation, Crawlspace & Structure",
    aliases: ["horizontal crack", "foundation movement", "settlement crack", "bowing wall", "structural crack"], ease: "specialist",
    costLow: 2000, costHigh: 15000, repairNote: "Evaluation by a qualified structural professional before closing." },
  { key: "crawlspace_moisture", label: "Crawlspace moisture / vapor barrier", section: "Basement, Foundation, Crawlspace & Structure",
    aliases: ["crawlspace moisture", "vapor barrier", "crawl space damp", "missing vapor barrier"], ease: "pro",
    costLow: 500, costHigh: 3000, repairNote: "Improve the vapor barrier and moisture control." },
  { key: "framing_rot", label: "Rot / moisture at framing", section: "Basement, Foundation, Crawlspace & Structure",
    aliases: ["wood rot", "rotted framing", "moisture at framing", "deteriorated joist"], ease: "specialist",
    costLow: 800, costHigh: 6000, repairNote: "Evaluation and repair of affected framing by a qualified contractor." },

  // ---- Attic, Insulation & Ventilation ----
  { key: "insufficient_insulation", label: "Insufficient attic insulation", section: "Attic, Insulation & Ventilation",
    aliases: ["insulation low", "insufficient insulation", "add insulation", "thin insulation"], ease: "pro",
    costLow: 800, costHigh: 2500, repairNote: "Add insulation to recommended levels." },
  { key: "poor_attic_ventilation", label: "Poor attic ventilation", section: "Attic, Insulation & Ventilation",
    aliases: ["attic ventilation", "poor ventilation", "blocked baffles", "no ridge vent"], ease: "pro",
    costLow: 300, costHigh: 1500, repairNote: "Improve intake/exhaust ventilation by a qualified contractor." },
  { key: "bath_fan_venting", label: "Bath/exhaust fan vents into attic", section: "Attic, Insulation & Ventilation",
    aliases: ["bath fan", "exhaust fan attic", "fan venting into attic"], ease: "handyman",
    costLow: 150, costHigh: 500, repairNote: "Duct the exhaust fan to the exterior." },

  // ---- Doors, Windows & Interior ----
  { key: "failed_window_seal", label: "Failed / fogged window seals", section: "Doors, Windows & Interior",
    aliases: ["fogged window", "failed seal", "broken seal window", "condensation between panes"], ease: "pro",
    costLow: 150, costHigh: 500, repairNote: "Replace the affected insulated glass units." },
  { key: "door_pull_location", label: "Door pulls in wrong location", section: "Doors, Windows & Interior",
    aliases: ["door pull", "bifold pull", "pulls installed"], ease: "handyman",
    costLow: 40, costHigh: 120, repairNote: "Relocate the pulls and patch the old holes; matching hardware may be needed." },
  { key: "trip_hazard", label: "Trip hazard / uneven surface", section: "Doors, Windows & Interior",
    aliases: ["trip hazard", "uneven floor", "raised threshold"], ease: "handyman",
    costLow: 50, costHigh: 400, repairNote: "Correct the uneven surface / mark the transition." },

  // ---- Built-in Appliances ----
  { key: "dryer_vent", label: "Dryer vent needs attention", section: "Built-in Appliances",
    aliases: ["dryer vent", "dryer duct", "lint buildup"], ease: "handyman",
    costLow: 100, costHigh: 250, repairNote: "Clean/correct the dryer vent — a common fire-safety item." },
  { key: "appliance_inop", label: "Built-in appliance inoperative", section: "Built-in Appliances",
    aliases: ["did not operate", "inoperative", "not functioning appliance", "appliance did not"], ease: "pro",
    costLow: 150, costHigh: 800, repairNote: "Service or replace the affected appliance." },

  // ---- Garage ----
  { key: "garage_auto_reverse", label: "Garage door auto-reverse / photo-eye", section: "Garage",
    aliases: ["auto reverse", "auto-reverse", "photo eye", "photo-eye", "safety sensor garage"], ease: "handyman",
    costLow: 75, costHigh: 250, repairNote: "Adjust/repair the safety reverse and photo-eyes." },
  { key: "garage_fire_separation", label: "Garage fire separation deficiency", section: "Garage",
    aliases: ["fire separation", "firewall garage", "self-closing door garage", "garage to house door"], ease: "handyman",
    costLow: 150, costHigh: 600, repairNote: "Restore the fire separation / self-closing door." },

  // ---- Fireplace ----
  { key: "chimney_needs_sweep", label: "Chimney / fireplace needs evaluation", section: "Fireplace",
    aliases: ["creosote", "chimney sweep", "damper", "firebox", "flue liner"], ease: "specialist",
    costLow: 200, costHigh: 1500, repairNote: "Have the chimney inspected and swept by a specialist before use." },
];

const CATALOG_BY_KEY = new Map(DEFECT_CATALOG.map((d) => [d.key, d]));
export function catalogEntry(key: string | null | undefined): DefectCatalogEntry | null {
  return key ? CATALOG_BY_KEY.get(key) || null : null;
}

// Classify a finding to a canonical defect key by alias match against its
// title + observation (and, as a tiebreaker, prefer an entry in the same
// section). Returns null when nothing matches — no Common Ground panel then.
export function classifyDefect(input: {
  title?: string | null;
  observation?: string | null;
  section?: string | null;
}): string | null {
  const hay = `${input.title || ""} ${input.observation || ""}`.toLowerCase();
  if (!hay.trim()) return null;
  const section = String(input.section || "").trim();

  let best: { key: string; sameSection: boolean; aliasLen: number } | null = null;
  for (const entry of DEFECT_CATALOG) {
    for (const alias of entry.aliases) {
      if (hay.includes(alias)) {
        const sameSection = Boolean(section) && entry.section === section;
        const aliasLen = alias.length;
        // Prefer a same-section match, then the most specific (longest) alias.
        if (
          !best ||
          (sameSection && !best.sameSection) ||
          (sameSection === best.sameSection && aliasLen > best.aliasLen)
        ) {
          best = { key: entry.key, sameSection, aliasLen };
        }
        break; // first alias hit for this entry is enough
      }
    }
  }
  return best?.key ?? null;
}

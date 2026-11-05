// Homeowner "weekend fix" suggestions. For a small, curated set of genuinely
// DIY-safe inspection findings, this returns the materials, tools, rough
// difficulty, time, and a ballpark SUPPLY cost a homeowner would grab at the
// hardware store. Pure functions, no I/O — safe server or client.
//
// SAFETY IS THE WHOLE DESIGN. This is a WHITELIST, not a classifier:
//   1. A finding earns a kit ONLY when its text matches a curated safe entry.
//   2. Even then, a hard VETO list blocks anything that smells of a dangerous
//      domain (electrical, gas, structural, roof/height, HVAC internals,
//      hazmat, sewer/supply lines) — veto always wins over a match.
//   3. Anything the inspector flagged Safety or Major Concern never gets a kit.
// When in doubt we show nothing. A missing kit is a non-event; a wrong one is a
// liability. Every entry's note also tells the homeowner when to stop and call
// a pro, and nothing here promises a permanent repair (matches FLOW's cautious
// wording rule).

export type DiyFinding = {
  title?: string | null;
  section?: string | null;
  severity?: string | null;
  recommendation?: string | null;
};

export type DiyFixIt = {
  findingTitle: string;
  task: string;
  difficulty: "Easy" | "Moderate";
  timeEstimate: string;
  materials: string[];
  tools: string[];
  costLow: number;
  costHigh: number;
  note: string;
};

// A curated entry: trigger keywords that mark a finding as this safe task, plus
// the kit. `key` dedupes so the hub never shows the same task twice.
type DiyEntry = Omit<DiyFixIt, "findingTitle"> & { key: string; triggers: string[] };

// Hard veto. If any of these appear in the finding text, NO kit is offered,
// even if a safe entry also matched. These are whole dangerous domains a
// homeowner should not self-fix, plus height/ladder work. Kept deliberately
// broad — a false veto just hides a suggestion; a false pass is a hazard.
const VETO_KEYWORDS = [
  // Electrical
  "electric", "wiring", "wire", "breaker", "panel", "circuit", "outlet",
  "receptacle", "gfci", "afci", "junction", "knob-and-tube", "knob and tube",
  "aluminum wiring", "service entrance", "service panel", "meter base",
  // Gas / combustion
  "gas", "propane", "lp line", "flue", "carbon monoxide", "combustion",
  // Structural
  "structural", "foundation", "joist", "beam", "truss", "load-bearing",
  "load bearing", "framing", "settlement", "settling", "footing", "bowing",
  "header", "girder", "column", "lintel",
  // Roof / height / ladder
  "roof", "shingle", "flashing", "chimney", "soffit", "fascia", "gutter",
  "ladder", "second story", "second-story", "upper level exterior",
  // HVAC internals (the air-filter entry's triggers avoid these words)
  "heat exchanger", "compressor", "condenser", "refrigerant", "evaporator",
  "burner", "ductwork", "boiler", "flue pipe",
  // Plumbing beyond a fixture
  "sewer", "sewage", "supply line", "main line", "water main", "shutoff valve",
  "water heater", "sump pump", "gas water heater", "drain line", "p-trap leak",
  // Hazardous materials
  "asbestos", "mold", "radon", "lead paint", "lead-based", "vermiculite",
  "mildew growth", "microbial",
];

// Curated safe tasks. Costs are hardware-store SUPPLY ranges in USD, not labor.
const DIY_ENTRIES: DiyEntry[] = [
  {
    key: "interior-caulk",
    triggers: ["caulk", "caulking", "sealant at tub", "sealant at shower", "grout and caulk", "re-caulk interior", "missing sealant around"],
    task: "Renew the caulk around the tub, shower, sink, or countertop",
    difficulty: "Easy",
    timeEstimate: "About 30–60 minutes per area",
    materials: ["Mildew-resistant silicone caulk (kitchen & bath)", "Painter's tape", "Rubbing alcohol and a clean rag"],
    tools: ["Caulk gun", "Caulk-removal tool or putty knife"],
    costLow: 12,
    costHigh: 30,
    note: "Pull the old caulk out completely and let the surface dry before resealing. If the material behind it is soft, spongy, or stained, stop and have it looked at.",
  },
  {
    key: "exterior-caulk",
    triggers: ["exterior caulk", "gaps around window", "gaps around door", "trim gaps", "seal exterior", "caulk exterior", "gaps in siding trim"],
    task: "Seal reachable gaps around exterior windows, doors, and trim",
    difficulty: "Easy",
    timeEstimate: "About 1–2 hours",
    materials: ["Paintable exterior caulk (siliconized acrylic)", "Clean rag"],
    tools: ["Caulk gun", "Caulk-removal tool"],
    costLow: 12,
    costHigh: 30,
    note: "Only seal gaps you can reach safely from the ground. Anything needing a ladder or up near the roofline is a job for a pro.",
  },
  {
    key: "weatherstripping",
    triggers: ["weatherstrip", "weather strip", "worn weatherstripping", "missing weatherstripping", "draft at door", "air leak at door"],
    task: "Replace worn door or window weatherstripping",
    difficulty: "Easy",
    timeEstimate: "About 30–60 minutes per door",
    materials: ["Adhesive-backed foam or V-seal weatherstripping", "Measuring tape"],
    tools: ["Scissors or a utility knife"],
    costLow: 12,
    costHigh: 35,
    note: "Measure before you buy, and clean the surface first so the adhesive actually grips.",
  },
  {
    key: "door-sweep",
    triggers: ["door sweep", "gap under door", "daylight under door", "threshold gap"],
    task: "Add or replace a door sweep",
    difficulty: "Easy",
    timeEstimate: "About 20–40 minutes",
    materials: ["Door sweep (slide-on or screw-on)", "Measuring tape"],
    tools: ["Screwdriver or drill", "Hacksaw to trim to width"],
    costLow: 10,
    costHigh: 25,
    note: "Measure the door width and trim the sweep to fit before installing.",
  },
  {
    key: "running-toilet",
    triggers: ["running toilet", "toilet runs", "toilet flapper", "fill valve", "toilet keeps running", "flapper"],
    task: "Replace the toilet flapper or fill valve",
    difficulty: "Easy",
    timeEstimate: "About 30–45 minutes",
    materials: ["Replacement flapper and/or fill-valve kit (match the brand)", "A towel"],
    tools: ["Adjustable pliers (sometimes none)"],
    costLow: 10,
    costHigh: 30,
    note: "Shut off the toilet's supply valve and flush to empty the tank first. This is tank-only work — if water leaks at the supply line or the base, call a plumber.",
  },
  {
    key: "faucet-aerator",
    triggers: ["aerator", "low flow at faucet", "low water pressure at faucet", "clogged aerator", "faucet flow"],
    task: "Clean or replace a clogged faucet aerator",
    difficulty: "Easy",
    timeEstimate: "About 15 minutes",
    materials: ["Replacement aerator (match the thread size)", "White vinegar to soak the screen"],
    tools: ["Adjustable pliers with a cloth to protect the finish"],
    costLow: 5,
    costHigh: 15,
    note: "Often just cleaning the screen restores the flow — try that before buying a new one.",
  },
  {
    key: "air-filter",
    triggers: ["air filter", "furnace filter", "hvac filter", "dirty filter", "replace the filter", "clogged filter", "return air filter"],
    task: "Replace the HVAC air filter",
    difficulty: "Easy",
    timeEstimate: "About 10 minutes",
    materials: ["Correct-size filter (the size is printed on the edge of the old one)"],
    tools: ["None"],
    costLow: 10,
    costHigh: 30,
    note: "Match the size exactly and follow the airflow arrow on the frame. Doing this every 1–3 months protects the whole system.",
  },
  {
    key: "loose-hardware",
    triggers: ["loose hinge", "loose handle", "loose knob", "loose cabinet", "cabinet door", "loose door hardware", "sticking cabinet", "loose hardware"],
    task: "Tighten or replace loose cabinet and door hardware",
    difficulty: "Easy",
    timeEstimate: "About 15–45 minutes",
    materials: ["Replacement screws, hinges, or handles as needed"],
    tools: ["Screwdriver or drill"],
    costLow: 5,
    costHigh: 25,
    note: "A slightly longer screw will often re-grab a hole that has stripped out.",
  },
  {
    key: "tile-grout",
    triggers: ["grout", "cracked grout", "missing grout", "regrout", "deteriorated grout", "tile joints"],
    task: "Repair cracked or missing tile grout",
    difficulty: "Moderate",
    timeEstimate: "About 2–3 hours plus cure time",
    materials: ["Grout (match the color)", "Grout sealer", "Sponge"],
    tools: ["Grout float", "Grout saw or removal tool", "Bucket"],
    costLow: 15,
    costHigh: 40,
    note: "Scrape out the loose grout first and keep the area dry while it cures. Grout that keeps cracking can point to movement worth having checked.",
  },
  {
    key: "drywall-patch",
    triggers: ["nail pop", "nail pops", "small drywall", "drywall nail", "minor drywall", "small hole in drywall", "patch and paint", "cosmetic wall"],
    task: "Patch minor drywall nail pops or small holes",
    difficulty: "Moderate",
    timeEstimate: "About 1 hour plus dry and paint time",
    materials: ["Spackle or patching compound", "Self-adhesive patch for small holes", "Sandpaper", "Matching paint"],
    tools: ["Putty knife", "Sanding block"],
    costLow: 15,
    costHigh: 40,
    note: "For anything bigger than a few inches, or cracks that keep coming back, have it evaluated — recurring cracks can signal movement behind the wall.",
  },
];

function haystack(f: DiyFinding): string {
  return [f.title, f.section, f.recommendation]
    .map((v) => (v == null ? "" : String(v)))
    .join(" ")
    .toLowerCase();
}

// True if the finding is flagged as a safety/major concern — never DIY.
function isHighSeverity(severity?: string | null): boolean {
  return /safety|major/i.test(String(severity || ""));
}

// True if the finding touches a vetoed (dangerous) domain.
export function isDiyVetoed(f: DiyFinding): boolean {
  if (isHighSeverity(f.severity)) return true;
  const hay = haystack(f);
  return VETO_KEYWORDS.some((k) => hay.includes(k));
}

// Match a single finding to a curated DIY task, or null if none applies.
// Veto is checked FIRST so a dangerous finding can never match.
export function matchDiyFixIt(f: DiyFinding): DiyFixIt | null {
  if (isDiyVetoed(f)) return null;
  const hay = haystack(f);
  if (!hay.trim()) return null;
  for (const entry of DIY_ENTRIES) {
    if (entry.triggers.some((trigger) => hay.includes(trigger))) {
      const { key: _key, triggers: _triggers, ...kit } = entry;
      return { findingTitle: String(f.title || "").trim() || kit.task, ...kit };
    }
  }
  return null;
}

// Build the homeowner's DIY list from all findings. Deduped by task (the same
// task is only shown once even if several findings map to it) and capped so the
// hub stays skimmable.
export function buildDiyFixIts(findings: DiyFinding[], limit = 8): DiyFixIt[] {
  const out: DiyFixIt[] = [];
  const seen = new Set<string>();
  for (const f of findings || []) {
    const kit = matchDiyFixIt(f);
    if (!kit) continue;
    if (seen.has(kit.task)) continue;
    seen.add(kit.task);
    out.push(kit);
    if (out.length >= limit) break;
  }
  return out;
}

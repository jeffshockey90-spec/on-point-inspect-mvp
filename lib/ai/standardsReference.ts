// Standards Brain — maps a finding to the recognized safety standard or code
// section it's commonly evaluated against, so FLOW can lend a finding authority
// ("GFCI protection — NEC 210.8") instead of just "looks off". Framed as
// ADVISORY REFERENCE, never a legal verdict: home inspectors note conditions and
// reference the applicable standard, they are not code officials. Conservative,
// keyword-matched, and deterministic — the same finding always cites the same
// standard. Returns 0–2 references (most-specific first).

export type StandardRef = {
  id: string;
  title: string;
  citation: string; // e.g. "NEC 210.8" or "IRC R311.7"
  note: string; // advisory, plain-English
  safety: boolean; // whether it's typically a safety item
};

type Entry = StandardRef & { keys: RegExp };

const STANDARDS: Entry[] = [
  {
    id: "gfci",
    keys: /\bgfci\b|ground[- ]?fault/,
    title: "GFCI protection",
    citation: "NEC 210.8",
    note: "Current safety standards call for GFCI protection at receptacles near water — kitchens, bathrooms, garages, exterior, laundry, and within 6 ft of a sink.",
    safety: true,
  },
  {
    id: "afci",
    keys: /\bafci\b|arc[- ]?fault/,
    title: "AFCI protection",
    citation: "NEC 210.12",
    note: "Modern standards call for arc-fault (AFCI) protection on most living-area branch circuits to reduce fire risk.",
    safety: true,
  },
  {
    id: "tpr",
    keys: /\btpr\b|temperature[- ]?pressure|relief valve|relief-valve|discharge (pipe|tube)/,
    title: "Water heater TPR discharge",
    citation: "IRC P2804",
    note: "The temperature/pressure relief valve should have a full-size discharge pipe terminating downward, 6 in. or less above the floor, unthreaded — so a discharge can't scald or go unnoticed.",
    safety: true,
  },
  {
    id: "handrail",
    keys: /hand[- ]?rail|handrail/,
    title: "Stair handrail",
    citation: "IRC R311.7",
    note: "A graspable handrail is expected on stairs with 4+ risers, mounted about 34–38 in. above the nosings, continuous along the run.",
    safety: true,
  },
  {
    id: "guardrail",
    keys: /guard[- ]?rail|\bguard\b|baluster|spindle spacing|railing.*(gap|spacing)/,
    title: "Guard / railing",
    citation: "IRC R312",
    note: "Guards are expected where a walking surface is more than 30 in. above the ground/floor, roughly 36 in. high, with openings that won't pass a 4-in. sphere.",
    safety: true,
  },
  {
    id: "stairs",
    keys: /riser|tread depth|stair (rise|run)|uneven (step|stair)/,
    title: "Stair rise & run",
    citation: "IRC R311.7.5",
    note: "Stairs are generally expected to have risers no taller than ~7¾ in. and treads at least ~10 in. deep, with little variation step to step.",
    safety: true,
  },
  {
    id: "smoke",
    keys: /smoke (alarm|detector)/,
    title: "Smoke alarms",
    citation: "IRC R314",
    note: "Smoke alarms are expected in each sleeping room, outside each sleeping area, and on every level, interconnected in newer homes.",
    safety: true,
  },
  {
    id: "co",
    keys: /carbon monoxide|\bco\b (alarm|detector)|co (alarm|detector)/,
    title: "Carbon monoxide alarms",
    citation: "IRC R315",
    note: "CO alarms are expected outside sleeping areas in homes with fuel-fired appliances or an attached garage.",
    safety: true,
  },
  {
    id: "flue",
    keys: /back[- ]?draft|backdraft|flue (gas|spillage)|spillage|improper draft|combustion air/,
    title: "Combustion venting / draft",
    citation: "IRC G2427 / M1801",
    note: "Fuel-fired appliances must draft properly and vent combustion byproducts to the exterior; spillage or backdraft is a carbon-monoxide safety concern.",
    safety: true,
  },
  {
    id: "double-tap",
    keys: /double[- ]?tap|double[- ]?lug|two (wires|conductors) under/,
    title: "Breaker double-tap",
    citation: "NEC 110.14",
    note: "Most breakers are listed for a single conductor; two wires under one lug (a double-tap) can loosen and overheat unless the breaker is rated for it.",
    safety: true,
  },
  {
    id: "open-splice",
    keys: /open (junction|splice|box)|missing cover plate|missing (junction )?box cover|exposed (wiring|splice)|junction box.*(cover|missing)/,
    title: "Open junction / missing cover",
    citation: "NEC 314.25 / 314.28",
    note: "Splices and energized parts must be enclosed in a covered box; open splices or a missing cover are a shock and fire concern.",
    safety: true,
  },
  {
    id: "reversed-polarity",
    keys: /reversed polarity|hot[- ]?neutral revers/,
    title: "Reversed polarity",
    citation: "NEC 200.11 / 406.3",
    note: "Hot and neutral reversed at a receptacle energizes parts that should be neutral — a shock hazard to be corrected.",
    safety: true,
  },
  {
    id: "grounding",
    keys: /ungrounded|no ground|missing ground|bonding|not bonded/,
    title: "Grounding / bonding",
    citation: "NEC 250",
    note: "Equipment and systems must be properly grounded and bonded so fault current has a safe path — ungrounded or unbonded conditions are a shock hazard.",
    safety: true,
  },
  {
    id: "dryer-vent",
    keys: /dryer (vent|duct).*(plastic|vinyl|flex)|(plastic|vinyl).*dryer (vent|duct)/,
    title: "Dryer exhaust duct",
    citation: "IRC M1502",
    note: "Dryer ducts should be smooth-wall rigid or semi-rigid metal — plastic or vinyl flex is a lint/fire hazard.",
    safety: true,
  },
  {
    id: "exhaust-attic",
    keys: /(bath|exhaust) (fan|vent).*(attic|terminat)|vent(ed|ing)? into the attic/,
    title: "Exhaust termination",
    citation: "IRC M1501 / R303",
    note: "Bath and exhaust fans should vent to the exterior, not into the attic, to avoid moisture damage and mold.",
    safety: false,
  },
];

export function matchStandards(text: string, max = 2): StandardRef[] {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return [];
  const hits: StandardRef[] = [];
  for (const entry of STANDARDS) {
    if (entry.keys.test(t)) {
      const { keys, ...ref } = entry;
      void keys;
      hits.push(ref);
      if (hits.length >= max) break;
    }
  }
  return hits;
}

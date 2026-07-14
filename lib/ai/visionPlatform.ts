export type VisionSource = "suggestion" | "reminder" | "limitation" | "data_plate" | "manual";

export type VisionObject = {
  key: string;
  label: string;
  section: string;
  category: string;
  confidence: number;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  documented: boolean;
  photoCount: number;
  source: VisionSource;
  aliases: string[];
};

export type VisionSectionCoverage = {
  section: string;
  score: number;
  complete: boolean;
  covered: string[];
  missing: string[];
  observedCount: number;
};

export type VisionRouteStep = {
  section: string;
  score: number;
  missingCount: number;
  reason: string;
};

export type InspectorVisionHabit = {
  key: string;
  label: string;
  section: string;
  count: number;
};

export type VisionSnapshot = {
  inspectionId: string;
  objects: VisionObject[];
  sections: VisionSectionCoverage[];
  route: VisionRouteStep[];
  habits: InspectorVisionHabit[];
  updatedAt: number;
};

type LiveResultLike = {
  area?: string;
  system?: string;
  suggestions?: Array<Record<string, any>>;
  reminders?: Array<Record<string, any>>;
  limitations?: Array<Record<string, any>>;
  dataPlatePrompt?: { needed?: boolean; reason?: string; equipmentType?: string };
};

export const VISION_SECTION_ORDER = [
  "Exterior",
  "Roof",
  "Garage",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Fireplace",
];

const REQUIREMENTS: Record<string, string[]> = {
  Exterior: [
    "front elevation",
    "rear elevation",
    "left elevation",
    "right elevation",
    "grading",
    "drainage",
    "siding",
    "exterior door",
    "window",
    "walkway",
    "driveway",
    "deck",
    "porch",
    "downspout",
    "hose bib",
    "electric meter",
    "gas meter",
  ],
  Roof: [
    "roof overview",
    "roof covering",
    "flashing",
    "gutter",
    "downspout",
    "plumbing vent",
    "roof vent",
    "chimney",
    "skylight",
  ],
  Garage: [
    "garage door",
    "garage opener",
    "safety sensor",
    "auto reverse",
    "garage receptacle",
    "fire separation",
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    "foundation",
    "floor structure",
    "support post",
    "beam",
    "crawlspace",
    "moisture",
    "sump pump",
  ],
  Heating: ["heating equipment", "data plate", "filter", "venting", "thermostat", "fuel shutoff"],
  Cooling: ["cooling equipment", "data plate", "condensate", "refrigerant line", "disconnect", "thermostat"],
  Plumbing: ["water heater", "data plate", "tpr valve", "main shutoff", "supply piping", "drain piping", "fixture"],
  Electrical: ["service panel", "panel directory", "main disconnect", "grounding", "bonding", "breaker", "gfci", "afci", "receptacle"],
  "Attic, Insulation & Ventilation": ["attic overview", "insulation", "ventilation", "roof sheathing", "wiring", "exhaust duct"],
  "Doors, Windows & Interior": ["interior door", "window", "wall", "ceiling", "floor", "stair", "railing", "smoke alarm", "carbon monoxide alarm"],
  "Built-in Appliances": ["range", "oven", "dishwasher", "disposal", "microwave", "range hood"],
  Fireplace: ["firebox", "damper", "hearth", "chimney", "flue"],
};

const CONCEPTS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "front elevation", patterns: [/front elevation/, /front exterior/] },
  { label: "rear elevation", patterns: [/rear elevation/, /rear exterior/] },
  { label: "left elevation", patterns: [/left elevation/, /left side exterior/] },
  { label: "right elevation", patterns: [/right elevation/, /right side exterior/] },
  { label: "roof overview", patterns: [/roof overview/, /overall roof/, /roof surface/] },
  { label: "roof covering", patterns: [/shingle/, /roof covering/, /metal roof/, /membrane roof/] },
  { label: "flashing", patterns: [/flashing/] },
  { label: "gutter", patterns: [/gutter/] },
  { label: "downspout", patterns: [/downspout/] },
  { label: "grading", patterns: [/grading/, /slope.*ground/, /ground.*slope/] },
  { label: "drainage", patterns: [/drainage/, /standing water/, /water management/] },
  { label: "siding", patterns: [/siding/, /wall covering/, /brick veneer/, /stucco/] },
  { label: "exterior door", patterns: [/exterior door/, /entry door/] },
  { label: "interior door", patterns: [/interior door/] },
  { label: "window", patterns: [/window/] },
  { label: "walkway", patterns: [/walkway/, /sidewalk/] },
  { label: "driveway", patterns: [/driveway/] },
  { label: "deck", patterns: [/deck/, /ledger/] },
  { label: "porch", patterns: [/porch/, /stoop/] },
  { label: "hose bib", patterns: [/hose bib/, /hose faucet/, /exterior faucet/] },
  { label: "electric meter", patterns: [/electric meter/, /service meter/] },
  { label: "gas meter", patterns: [/gas meter/] },
  { label: "plumbing vent", patterns: [/plumbing vent/, /vent stack/] },
  { label: "roof vent", patterns: [/roof vent/, /ridge vent/, /box vent/] },
  { label: "chimney", patterns: [/chimney/] },
  { label: "skylight", patterns: [/skylight/] },
  { label: "garage door", patterns: [/garage door/] },
  { label: "garage opener", patterns: [/garage opener/, /door opener/] },
  { label: "safety sensor", patterns: [/safety sensor/, /photo eye/] },
  { label: "auto reverse", patterns: [/auto reverse/, /reversal test/, /reverse test/] },
  { label: "fire separation", patterns: [/fire separation/, /fire rated/, /garage.*dwelling/] },
  { label: "foundation", patterns: [/foundation/] },
  { label: "floor structure", patterns: [/floor joist/, /floor structure/] },
  { label: "support post", patterns: [/support post/, /column/] },
  { label: "beam", patterns: [/beam/] },
  { label: "crawlspace", patterns: [/crawlspace/, /crawl space/] },
  { label: "moisture", patterns: [/moisture/, /water stain/, /damp/] },
  { label: "sump pump", patterns: [/sump pump/] },
  { label: "heating equipment", patterns: [/furnace/, /boiler/, /heating equipment/, /heat pump/] },
  { label: "cooling equipment", patterns: [/air conditioner/, /condensing unit/, /cooling equipment/, /heat pump/] },
  { label: "data plate", patterns: [/data plate/, /nameplate/, /manufacturer label/, /serial number/] },
  { label: "filter", patterns: [/filter/] },
  { label: "venting", patterns: [/vent connector/, /flue pipe/, /venting/] },
  { label: "thermostat", patterns: [/thermostat/] },
  { label: "fuel shutoff", patterns: [/fuel shutoff/, /gas shutoff/, /oil shutoff/] },
  { label: "condensate", patterns: [/condensate/] },
  { label: "refrigerant line", patterns: [/refrigerant line/, /suction line/, /line set/] },
  { label: "disconnect", patterns: [/disconnect/] },
  { label: "water heater", patterns: [/water heater/] },
  { label: "tpr valve", patterns: [/tpr/, /temperature.*pressure.*relief/, /relief valve/] },
  { label: "main shutoff", patterns: [/main shutoff/, /water shutoff/] },
  { label: "supply piping", patterns: [/supply piping/, /water piping/, /copper pipe/, /pex/] },
  { label: "drain piping", patterns: [/drain piping/, /drain line/, /waste piping/] },
  { label: "fixture", patterns: [/fixture/, /sink/, /toilet/, /tub/, /shower/] },
  { label: "service panel", patterns: [/service panel/, /electrical panel/, /breaker panel/] },
  { label: "panel directory", patterns: [/panel directory/, /circuit directory/, /panel label/] },
  { label: "main disconnect", patterns: [/main disconnect/, /main breaker/] },
  { label: "grounding", patterns: [/grounding/, /ground electrode/] },
  { label: "bonding", patterns: [/bonding/] },
  { label: "breaker", patterns: [/breaker/] },
  { label: "gfci", patterns: [/gfci/, /ground fault/] },
  { label: "afci", patterns: [/afci/, /arc fault/] },
  { label: "receptacle", patterns: [/receptacle/, /outlet/] },
  { label: "attic overview", patterns: [/attic overview/, /attic space/] },
  { label: "insulation", patterns: [/insulation/] },
  { label: "ventilation", patterns: [/ventilation/, /soffit vent/, /ridge vent/] },
  { label: "roof sheathing", patterns: [/roof sheathing/, /roof decking/] },
  { label: "wiring", patterns: [/wiring/, /wire/] },
  { label: "exhaust duct", patterns: [/exhaust duct/, /bath fan duct/, /dryer vent/] },
  { label: "wall", patterns: [/wall/] },
  { label: "ceiling", patterns: [/ceiling/] },
  { label: "floor", patterns: [/floor/] },
  { label: "stair", patterns: [/stair/, /step/] },
  { label: "railing", patterns: [/railing/, /guardrail/, /handrail/] },
  { label: "smoke alarm", patterns: [/smoke alarm/, /smoke detector/] },
  { label: "carbon monoxide alarm", patterns: [/carbon monoxide/, /co alarm/, /co detector/] },
  { label: "range", patterns: [/range/, /cooktop/] },
  { label: "oven", patterns: [/oven/] },
  { label: "dishwasher", patterns: [/dishwasher/] },
  { label: "disposal", patterns: [/disposal/] },
  { label: "microwave", patterns: [/microwave/] },
  { label: "range hood", patterns: [/range hood/, /kitchen exhaust/] },
  { label: "firebox", patterns: [/firebox/] },
  { label: "damper", patterns: [/damper/] },
  { label: "hearth", patterns: [/hearth/] },
  { label: "flue", patterns: [/flue/] },
];

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function confidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.72;
  if (number > 1) return Math.max(0, Math.min(1, number / 100));
  return Math.max(0, Math.min(1, number));
}

function findConcepts(text: string) {
  const found = new Set<string>();
  for (const concept of CONCEPTS) {
    if (concept.patterns.some((pattern) => pattern.test(text))) found.add(concept.label);
  }
  return Array.from(found);
}

function objectFromText(args: {
  text: string;
  fallbackLabel: string;
  section: string;
  confidence?: unknown;
  source: VisionSource;
  now: number;
}) {
  const concepts = findConcepts(args.text);
  const label = concepts[0] || normalizeText(args.fallbackLabel) || "inspection item";
  return concepts.length
    ? concepts.map((concept) => ({
        key: `${slug(args.section)}:${slug(concept)}`,
        label: concept,
        section: args.section,
        category: concept,
        confidence: confidence(args.confidence),
        firstSeenAt: args.now,
        lastSeenAt: args.now,
        seenCount: 1,
        documented: false,
        photoCount: 0,
        source: args.source,
        aliases: [normalizeText(args.fallbackLabel)].filter(Boolean),
      }))
    : [{
        key: `${slug(args.section)}:${slug(label)}`,
        label,
        section: args.section,
        category: label,
        confidence: confidence(args.confidence),
        firstSeenAt: args.now,
        lastSeenAt: args.now,
        seenCount: 1,
        documented: false,
        photoCount: 0,
        source: args.source,
        aliases: [normalizeText(args.fallbackLabel)].filter(Boolean),
      }];
}

export function extractVisionObjects(result: LiveResultLike, section: string, now = Date.now()) {
  const objects: VisionObject[] = [];

  for (const suggestion of result.suggestions || []) {
    const text = normalizeText([
      suggestion.title,
      suggestion.observation,
      suggestion.implication,
      suggestion.recommendation,
      ...(Array.isArray(suggestion.evidence) ? suggestion.evidence : []),
    ].join(" "));
    objects.push(...objectFromText({ text, fallbackLabel: suggestion.title, section: suggestion.section || section, confidence: suggestion.confidence, source: "suggestion", now }));
  }

  for (const reminder of result.reminders || []) {
    const text = normalizeText([reminder.title, reminder.detail, reminder.action].join(" "));
    objects.push(...objectFromText({ text, fallbackLabel: reminder.title, section, confidence: reminder.confidence, source: "reminder", now }));
  }

  for (const limitation of result.limitations || []) {
    const text = normalizeText([limitation.title, limitation.limitation, limitation.reason, limitation.recommendation].join(" "));
    objects.push(...objectFromText({ text, fallbackLabel: limitation.title, section: limitation.section || section, confidence: limitation.confidence, source: "limitation", now }));
  }

  if (result.dataPlatePrompt?.needed) {
    objects.push(...objectFromText({
      text: normalizeText([result.dataPlatePrompt.equipmentType, result.dataPlatePrompt.reason, "data plate"].join(" ")),
      fallbackLabel: result.dataPlatePrompt.equipmentType || "data plate",
      section,
      confidence: 0.8,
      source: "data_plate",
      now,
    }));
  }

  return mergeVisionObjects([], objects);
}

export function mergeVisionObjects(current: VisionObject[], incoming: VisionObject[]) {
  const map = new Map(current.map((item) => [item.key, { ...item }]));
  for (const next of incoming) {
    const existing = map.get(next.key);
    if (!existing) {
      map.set(next.key, next);
      continue;
    }
    map.set(next.key, {
      ...existing,
      label: existing.label || next.label,
      confidence: Math.max(existing.confidence, next.confidence),
      firstSeenAt: Math.min(existing.firstSeenAt, next.firstSeenAt),
      lastSeenAt: Math.max(existing.lastSeenAt, next.lastSeenAt),
      seenCount: existing.seenCount + Math.max(1, next.seenCount),
      documented: existing.documented || next.documented,
      photoCount: existing.photoCount + next.photoCount,
      aliases: Array.from(new Set([...existing.aliases, ...next.aliases])).slice(0, 8),
    });
  }
  return Array.from(map.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function markVisionDocumented(objects: VisionObject[], section: string, keys?: string[]) {
  const keySet = keys?.length ? new Set(keys) : null;
  const cutoff = Date.now() - 45000;
  return objects.map((item) => {
    const eligible = item.section === section && (keySet ? keySet.has(item.key) : item.lastSeenAt >= cutoff);
    return eligible ? { ...item, documented: true, photoCount: item.photoCount + 1, lastSeenAt: Date.now() } : item;
  });
}

export function calculateSectionCoverage(section: string, objects: VisionObject[]): VisionSectionCoverage {
  const requirements = REQUIREMENTS[section] || [];
  const sectionObjects = objects.filter((item) => item.section === section);
  const covered = requirements.filter((requirement) =>
    sectionObjects.some((item) => item.category === requirement && (item.documented || item.seenCount >= 2 || item.confidence >= 0.9)),
  );
  const missing = requirements.filter((item) => !covered.includes(item));
  const raw = requirements.length ? Math.round((covered.length / requirements.length) * 100) : Math.min(100, sectionObjects.length * 10);
  const score = Math.max(0, Math.min(100, raw));
  return { section, score, complete: score >= 92 && missing.length <= 1, covered, missing, observedCount: sectionObjects.length };
}

export function buildVisionSnapshot(inspectionId: string, objects: VisionObject[], habits: InspectorVisionHabit[] = []): VisionSnapshot {
  const sections = VISION_SECTION_ORDER.map((section) => calculateSectionCoverage(section, objects));
  const route = sections
    .filter((item) => !item.complete)
    .sort((a, b) => {
      const currentA = a.observedCount > 0 ? 0 : 1;
      const currentB = b.observedCount > 0 ? 0 : 1;
      return currentA - currentB || b.score - a.score || VISION_SECTION_ORDER.indexOf(a.section) - VISION_SECTION_ORDER.indexOf(b.section);
    })
    .slice(0, 5)
    .map((item) => ({
      section: item.section,
      score: item.score,
      missingCount: item.missing.length,
      reason: item.observedCount > 0 ? `${item.missing.length} expected item${item.missing.length === 1 ? "" : "s"} remain.` : "This section has not been documented yet.",
    }));

  return { inspectionId, objects, sections, route, habits: habits.slice(0, 12), updatedAt: Date.now() };
}

export function snapshotStorageKey(inspectionId: string) {
  return `opi-vision-platform-${String(inspectionId || "").trim()}`;
}

export function readVisionSnapshot(inspectionId: string): VisionSnapshot {
  if (typeof window === "undefined" || !inspectionId) return buildVisionSnapshot(inspectionId, []);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(snapshotStorageKey(inspectionId)) || "null");
    if (parsed?.inspectionId === inspectionId && Array.isArray(parsed.objects)) {
      return buildVisionSnapshot(inspectionId, parsed.objects, Array.isArray(parsed.habits) ? parsed.habits : []);
    }
  } catch {}
  return buildVisionSnapshot(inspectionId, []);
}

export function writeVisionSnapshot(snapshot: VisionSnapshot) {
  if (typeof window === "undefined" || !snapshot.inspectionId) return;
  try {
    window.localStorage.setItem(snapshotStorageKey(snapshot.inspectionId), JSON.stringify(snapshot));
  } catch {}
}

const HABIT_KEY = "opi-inspector-vision-habits-v1";

export function readInspectorVisionHabits(): InspectorVisionHabit[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HABIT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function reinforceInspectorVisionHabits(objects: VisionObject[]) {
  if (typeof window === "undefined") return readInspectorVisionHabits();
  const map = new Map(readInspectorVisionHabits().map((item) => [item.key, item]));
  for (const object of objects.filter((item) => item.documented)) {
    const existing = map.get(object.key);
    map.set(object.key, {
      key: object.key,
      label: object.label,
      section: object.section,
      count: (existing?.count || 0) + 1,
    });
  }
  const next = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 80);
  try { window.localStorage.setItem(HABIT_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function findVisionObjectForText(snapshot: VisionSnapshot, section: string, text: string) {
  const normalized = normalizeText(text);
  const concepts = findConcepts(normalized);
  return snapshot.objects.find((item) => item.section === section && (concepts.includes(item.category) || normalized.includes(item.label)));
}

export function objectsFromMemoryEvents(events: any[]) {
  const objects: VisionObject[] = [];
  for (const event of events || []) {
    if (event?.event_type !== "vision_observation_batch") continue;
    const batch = Array.isArray(event?.payload?.objects) ? event.payload.objects : [];
    for (const raw of batch) {
      if (!raw?.key || !raw?.section) continue;
      objects.push({
        key: String(raw.key),
        label: String(raw.label || raw.category || "inspection item"),
        section: String(raw.section),
        category: String(raw.category || raw.label || "inspection item"),
        confidence: confidence(raw.confidence),
        firstSeenAt: Number(raw.firstSeenAt || new Date(event.created_at || Date.now()).getTime()),
        lastSeenAt: Number(raw.lastSeenAt || new Date(event.created_at || Date.now()).getTime()),
        seenCount: Number(raw.seenCount || 1),
        documented: Boolean(raw.documented),
        photoCount: Number(raw.photoCount || 0),
        source: (raw.source || "manual") as VisionSource,
        aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
      });
    }
  }
  return mergeVisionObjects([], objects);
}

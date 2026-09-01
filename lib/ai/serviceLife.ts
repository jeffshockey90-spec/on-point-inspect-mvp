// Prognosis engine — a DETERMINISTIC service-life reference so FLOW can say
// "this water heater is past its expected life" the same way every time, instead
// of relying on the analyzer's free-form guess. Values are typical-life ranges
// (years) drawn from standard home-component life-expectancy references (e.g.
// InterNACHI's chart). This is grounded reference data, not a per-home estimate
// — it complements the AI's read and gives a consistent end-of-life flag.

type LifeEntry = { keys: RegExp; low: number; high: number; label: string };

// Ordered MOST-SPECIFIC first — the first regex that matches the component text
// wins (so "tankless water heater" beats "water heater").
const SERVICE_LIFE: LifeEntry[] = [
  { keys: /tankless/, low: 18, high: 20, label: "tankless water heater" },
  { keys: /water heater|hot water tank|\bwater tank\b/, low: 8, high: 12, label: "water heater" },
  { keys: /\bboiler\b/, low: 20, high: 35, label: "boiler" },
  { keys: /\bfurnace\b|air handler|forced air/, low: 15, high: 25, label: "furnace" },
  { keys: /heat pump/, low: 10, high: 16, label: "heat pump" },
  { keys: /evaporative|swamp cooler/, low: 15, high: 25, label: "evaporative cooler" },
  { keys: /condenser|air conditioner|central air|\bac unit\b|\ba\/c\b|\bac\b/, low: 12, high: 15, label: "air conditioner" },
  { keys: /metal roof|standing seam/, low: 40, high: 70, label: "metal roof" },
  { keys: /tile roof|slate roof|clay tile/, low: 50, high: 75, label: "tile/slate roof" },
  { keys: /wood shake|wood shingle|cedar shake/, low: 20, high: 30, label: "wood roof" },
  { keys: /architectural shingle|dimensional shingle/, low: 25, high: 30, label: "architectural shingle roof" },
  { keys: /asphalt|composition|3-tab|shingle roof|\bshingles?\b/, low: 15, high: 25, label: "asphalt shingle roof" },
  { keys: /dishwasher/, low: 9, high: 12, label: "dishwasher" },
  { keys: /garbage disposal|disposer/, low: 8, high: 12, label: "garbage disposal" },
  { keys: /microwave/, low: 9, high: 10, label: "microwave" },
  { keys: /range|oven|cooktop|\bstove\b/, low: 15, high: 20, label: "range/oven" },
  { keys: /refrigerator|\bfridge\b/, low: 13, high: 15, label: "refrigerator" },
  { keys: /\bwasher\b|\bdryer\b/, low: 10, high: 13, label: "washer/dryer" },
  { keys: /sump pump/, low: 7, high: 10, label: "sump pump" },
  { keys: /well pump/, low: 10, high: 15, label: "well pump" },
  { keys: /water softener/, low: 15, high: 20, label: "water softener" },
  { keys: /garage door opener/, low: 10, high: 15, label: "garage door opener" },
  { keys: /electrical panel|service panel|load center|panelboard/, low: 40, high: 60, label: "electrical panel" },
];

export type Prognosis = {
  matched: boolean;
  label?: string;
  low?: number;
  high?: number;
  ageYears?: number | null;
  remainingYears?: number | null; // years to the HIGH end (0 = at/over)
  status?: "serviceable" | "near" | "past" | "unknown-age";
  summary: string;
};

// Pull an age in years from a manufacture year and/or a free-form age string.
export function deriveAgeYears(
  currentYear: number,
  manufactureYear?: string | number | null,
  estimatedAge?: string | number | null,
): number | null {
  const yr = parseInt(String(manufactureYear ?? "").match(/\b(19|20)\d{2}\b/)?.[0] || "", 10);
  if (Number.isFinite(yr) && yr >= 1900 && yr <= currentYear) return currentYear - yr;
  const a = parseInt(String(estimatedAge ?? "").match(/\d+/)?.[0] || "", 10);
  if (Number.isFinite(a) && a >= 0 && a < 120) return a;
  return null;
}

function findEntry(typeText: string): LifeEntry | null {
  const t = String(typeText || "").toLowerCase();
  if (!t.trim()) return null;
  for (const entry of SERVICE_LIFE) if (entry.keys.test(t)) return entry;
  return null;
}

export function estimatePrognosis(typeText: string, ageYears: number | null): Prognosis {
  const entry = findEntry(typeText);
  if (!entry) return { matched: false, summary: "" };

  const life = `typical ${entry.low}–${entry.high} yrs`;
  if (ageYears == null) {
    return {
      matched: true, label: entry.label, low: entry.low, high: entry.high,
      ageYears: null, remainingYears: null, status: "unknown-age",
      summary: `${cap(entry.label)}: ${life}. Age unknown — capture the data plate to estimate remaining life.`,
    };
  }

  const remainingToHigh = Math.max(0, entry.high - ageYears);
  let status: Prognosis["status"];
  let tail: string;
  if (ageYears >= entry.high) {
    status = "past";
    tail = "past its expected service life — budget for replacement.";
  } else if (ageYears >= entry.low) {
    status = "near";
    tail = `near end of expected life (~${remainingToHigh} yr${remainingToHigh === 1 ? "" : "s"} remaining).`;
  } else {
    status = "serviceable";
    tail = `serviceable (~${entry.low - ageYears}–${entry.high - ageYears} yrs remaining).`;
  }

  return {
    matched: true, label: entry.label, low: entry.low, high: entry.high,
    ageYears, remainingYears: remainingToHigh, status,
    summary: `~${ageYears} yr${ageYears === 1 ? "" : "s"} old · ${life} · ${tail}`,
  };
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

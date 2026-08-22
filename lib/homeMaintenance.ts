// Homeowner-portal maintenance intelligence. Turns the equipment FLOW already
// captured (equipment_inventory) into a plain-English service life read and a
// seasonal maintenance plan tailored to the systems actually in the home.
// Pure functions, no I/O — safe to use server or client.

export type EquipmentRow = {
  id?: string | number;
  equipment_type?: string | null;
  section?: string | null;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  model_number?: string | null;
  serial?: string | null;
  serial_number?: string | null;
  estimated_age?: string | number | null;
  manufacture_year?: string | number | null;
  expected_service_life?: string | number | null;
  life_expectancy_percent?: string | number | null;
  maintenance_schedule?: string | null;
  known_failure_patterns?: string | null;
  replacement_cost_estimate?: string | null;
  recall_awareness?: string | null;
  condition?: string | null;
};

// Pull the first (or an averaged) number out of strings like "12", "12 years",
// "10-15 years", "~8 yrs". Returns null when there's nothing numeric.
function parseYears(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const nums = String(value)
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const parsed = nums.map(Number).filter((n) => Number.isFinite(n));
  if (!parsed.length) return null;
  if (parsed.length >= 2) return (parsed[0] + parsed[1]) / 2; // midpoint of a range
  return parsed[0];
}

export type EquipmentLife = {
  ageYears: number | null;
  serviceLifeYears: number | null;
  pctUsed: number | null; // 0-100
  remainingYears: number | null;
  status: "healthy" | "aging" | "near-end" | "unknown";
  statusLabel: string;
};

export function computeEquipmentLife(
  row: EquipmentRow,
  currentYear: number,
): EquipmentLife {
  let ageYears = parseYears(row.estimated_age);
  if (ageYears == null) {
    const year = parseYears(row.manufacture_year);
    if (year && year > 1900 && year <= currentYear) ageYears = currentYear - year;
  }
  const serviceLifeYears = parseYears(row.expected_service_life);

  let pctUsed = parseYears(row.life_expectancy_percent);
  if (pctUsed == null && ageYears != null && serviceLifeYears && serviceLifeYears > 0) {
    pctUsed = (ageYears / serviceLifeYears) * 100;
  }
  if (pctUsed != null) pctUsed = Math.max(0, Math.min(100, Math.round(pctUsed)));

  const remainingYears =
    ageYears != null && serviceLifeYears != null
      ? Math.max(0, Math.round(serviceLifeYears - ageYears))
      : null;

  let status: EquipmentLife["status"] = "unknown";
  let statusLabel = "Age not determined";
  if (pctUsed != null) {
    if (pctUsed < 60) {
      status = "healthy";
      statusLabel = "Within expected life";
    } else if (pctUsed < 90) {
      status = "aging";
      statusLabel = "Approaching end of life — start budgeting";
    } else {
      status = "near-end";
      statusLabel = "At or past expected life — plan replacement";
    }
  }

  return { ageYears, serviceLifeYears, pctUsed, remainingYears, status, statusLabel };
}

// A friendly display name for a piece of equipment.
export function equipmentName(row: EquipmentRow): string {
  const t = String(row.equipment_type || "").trim();
  if (t) return t;
  const s = String(row.section || "").trim();
  if (s) return `${s} Equipment`;
  return "Home System";
}

export type MaintenanceTask = {
  title: string;
  cadence: string; // e.g. "Every 1–3 months"
  why: string;
  season?: "Spring" | "Summer" | "Fall" | "Winter" | "Year-round";
};

// Which systems are present, inferred from equipment sections/types + the raw
// finding sections passed in.
function presentSystems(equipment: EquipmentRow[], sections: string[]): Set<string> {
  const hay = (
    equipment
      .map((e) => `${e.equipment_type || ""} ${e.section || ""}`)
      .join(" ") +
    " " +
    sections.join(" ")
  ).toLowerCase();
  const present = new Set<string>();
  const has = (...keys: string[]) => keys.some((k) => hay.includes(k));
  if (has("heat", "furnace", "boiler", "hvac")) present.add("heating");
  if (has("cool", "ac", "a/c", "condenser", "heat pump", "hvac")) present.add("cooling");
  if (has("water heater", "plumb", "sump", "well")) present.add("plumbing");
  if (has("electric", "panel", "breaker")) present.add("electrical");
  if (has("roof", "gutter", "chimney")) present.add("roof");
  if (has("appliance", "dishwasher", "range", "oven", "dryer", "washer", "disposal"))
    present.add("appliances");
  if (has("garage", "opener")) present.add("garage");
  if (has("exterior", "siding", "deck", "grading")) present.add("exterior");
  if (has("fireplace", "wood stove")) present.add("fireplace");
  return present;
}

// Build a seasonal maintenance plan tailored to the home. Always includes the
// life-safety basics (smoke/CO), then adds tasks for the systems present.
export function buildMaintenancePlan(
  equipment: EquipmentRow[],
  sections: string[] = [],
): MaintenanceTask[] {
  const sys = presentSystems(equipment, sections);
  const tasks: MaintenanceTask[] = [];

  // Life-safety basics — every home.
  tasks.push({
    title: "Test smoke & carbon-monoxide alarms",
    cadence: "Monthly · batteries yearly",
    why: "The single most important safety habit in any home.",
    season: "Year-round",
  });

  if (sys.has("heating") || sys.has("cooling")) {
    tasks.push({
      title: "Replace HVAC air filters",
      cadence: "Every 1–3 months",
      why: "Keeps airflow strong, lowers energy bills, and protects the equipment.",
      season: "Year-round",
    });
  }
  if (sys.has("heating")) {
    tasks.push({
      title: "Have the heating system serviced",
      cadence: "Once a year (fall)",
      why: "A pre-winter tune-up catches problems before the cold and extends the unit's life.",
      season: "Fall",
    });
  }
  if (sys.has("cooling")) {
    tasks.push({
      title: "Have the A/C serviced & clear the condenser",
      cadence: "Once a year (spring)",
      why: "Clean coils and correct charge keep cooling efficient through summer.",
      season: "Spring",
    });
  }
  if (sys.has("plumbing")) {
    tasks.push({
      title: "Flush the water heater & test the TPR valve",
      cadence: "Once a year",
      why: "Removes sediment, keeps efficiency up, and confirms the safety valve works.",
      season: "Year-round",
    });
    tasks.push({
      title: "Winterize exterior faucets & know your main shutoff",
      cadence: "Once a year (fall)",
      why: "Prevents burst pipes; knowing the shutoff limits damage in an emergency.",
      season: "Fall",
    });
  }
  if (sys.has("electrical")) {
    tasks.push({
      title: "Test GFCI / AFCI outlets and breakers",
      cadence: "Monthly",
      why: "These devices protect against shock and fire — press test, confirm they trip.",
      season: "Year-round",
    });
  }
  if (sys.has("roof")) {
    tasks.push({
      title: "Clean gutters & downspouts",
      cadence: "Twice a year (spring & fall)",
      why: "Clogged gutters push water into the roof, siding, and foundation.",
      season: "Fall",
    });
    tasks.push({
      title: "Look over the roof (from the ground) after storms",
      cadence: "Seasonally & after major weather",
      why: "Catching a lifted or missing shingle early prevents interior leaks.",
      season: "Year-round",
    });
  }
  if (sys.has("exterior")) {
    tasks.push({
      title: "Check grading, caulking & exterior sealant",
      cadence: "Once a year",
      why: "Directing water away from the home is the cheapest protection there is.",
      season: "Spring",
    });
  }
  if (sys.has("appliances")) {
    tasks.push({
      title: "Clean the dryer vent & refrigerator coils",
      cadence: "Once a year",
      why: "A clogged dryer vent is a common fire cause; clean coils extend fridge life.",
      season: "Year-round",
    });
  }
  if (sys.has("garage")) {
    tasks.push({
      title: "Test the garage door auto-reverse & photo-eyes",
      cadence: "Monthly",
      why: "Confirms the door reverses on an obstruction — an important safety check.",
      season: "Year-round",
    });
  }
  if (sys.has("fireplace")) {
    tasks.push({
      title: "Have the chimney inspected & swept",
      cadence: "Once a year before use",
      why: "Removes creosote buildup that can cause a chimney fire.",
      season: "Fall",
    });
  }

  return tasks;
}

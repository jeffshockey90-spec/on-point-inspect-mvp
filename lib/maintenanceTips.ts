// Client-facing home maintenance guide shown on the report. Curated, cautious
// wording per [[cautious-report-wording]]: TYPICAL intervals and "varies with
// use/conditions", never guarantees or hard deadlines. Not a substitute for
// manufacturer instructions or professional service.

export type MaintenanceTip = {
  task: string;
  cadence: string; // e.g. "Every 1–3 months"
  detail: string;
};

export type MaintenanceCategory = {
  key: string;
  title: string;
  icon: string; // emoji, matches the report's light styling
  // Lowercase substrings — the category only shows when the report actually
  // covers one of these systems (e.g. no HVAC section -> no HVAC tips).
  matchSections: string[];
  tips: MaintenanceTip[];
};

// Keep only the categories whose systems the report actually inspected.
export function maintenanceForSections(sections: string[]): MaintenanceCategory[] {
  const haystack = (sections || []).map((s) => String(s || "").toLowerCase());
  if (haystack.length === 0) return MAINTENANCE_TIPS; // no section data -> show all
  return MAINTENANCE_TIPS.filter((cat) =>
    cat.matchSections.some((needle) => haystack.some((s) => s.includes(needle))),
  );
}

export const MAINTENANCE_TIPS: MaintenanceCategory[] = [
  {
    key: "hvac",
    title: "Heating & Cooling (HVAC)",
    icon: "🌡️",
    matchSections: ["heating", "cooling", "hvac", "furnace", "air condition", "heat pump"],
    tips: [
      {
        task: "Change the air filter",
        cadence: "Check monthly · replace every 1–3 months",
        detail:
          "Check the filter monthly and hold it up to the light — if you can't see through it, replace it. A typical 1-inch pleated filter is changed every 1–3 months; replace more often with pets, allergies, smokers, or during heavy heating/cooling seasons. A thicker 4–5-inch media filter often lasts 6–12 months. A clean filter helps the system run efficiently and protects the equipment.",
      },
      {
        task: "Keep the outdoor unit clear",
        cadence: "Seasonally",
        detail:
          "Keep about 2 feet of clearance around the outdoor A/C or heat-pump unit — trim vegetation and rinse off leaves, grass clippings, and dust so it can breathe.",
      },
      {
        task: "Professional service",
        cadence: "Once a year (each season)",
        detail:
          "Have a licensed HVAC technician service the heating before winter and the cooling before summer. Annual service helps the system run smoothly and can catch small issues early.",
      },
      {
        task: "Keep vents open and clear",
        cadence: "Ongoing",
        detail:
          "Don't block supply or return vents with furniture or rugs — restricted airflow makes the system work harder.",
      },
    ],
  },
  {
    key: "plumbing",
    title: "Plumbing & Water Heater",
    icon: "🚿",
    matchSections: ["plumbing", "water heater"],
    tips: [
      {
        task: "Flush the water heater",
        cadence: "About once a year",
        detail:
          "Draining a few gallons from a tank water heater once a year helps reduce sediment buildup. For a tankless unit, descale per the manufacturer's schedule (often annually, sooner with hard water).",
      },
      {
        task: "Know your main shutoff",
        cadence: "Know it now",
        detail:
          "Locate the main water shutoff valve so you can stop water quickly if a leak or burst pipe happens. It's usually where the water line enters the home.",
      },
      {
        task: "Look for leaks",
        cadence: "Every few months",
        detail:
          "Periodically check under sinks, around toilets, and near the washer, dishwasher, and water heater for drips, stains, or dampness. Catching a small leak early prevents bigger damage.",
      },
      {
        task: "Winterize exterior faucets",
        cadence: "Before first freeze",
        detail:
          "Disconnect hoses and shut off/drain exterior faucets before winter to help prevent frozen, burst pipes.",
      },
    ],
  },
  {
    key: "safety",
    title: "Safety",
    icon: "🛟",
    // Safety touches electrical (GFCI), the dryer vent (attic/laundry) and
    // alarms — essentially every inspected home, so match broadly.
    matchSections: ["electrical", "attic", "insulation", "interior", "laundry", "garage"],
    tips: [
      {
        task: "Test smoke & CO alarms",
        cadence: "Test monthly · batteries yearly",
        detail:
          "Press the test button on each smoke and carbon-monoxide alarm monthly, and replace batteries at least once a year. Smoke alarms are typically replaced about every 10 years and CO alarms about every 5–7 years (check the date on the unit).",
      },
      {
        task: "Clean the dryer vent",
        cadence: "About once a year",
        detail:
          "Clean the lint from the dryer's exhaust duct at least yearly (and the lint trap every load). A clogged dryer vent is a common fire risk and makes clothes take longer to dry.",
      },
      {
        task: "Test GFCI outlets",
        cadence: "Monthly",
        detail:
          "Press 'Test' then 'Reset' on GFCI outlets (kitchens, baths, garage, exterior) to confirm they trip and reset. These protect against shock near water.",
      },
      {
        task: "Fire extinguisher check",
        cadence: "Monthly glance",
        detail:
          "Keep an extinguisher accessible in the kitchen/garage and glance at the gauge to confirm it's in the charged (green) zone.",
      },
    ],
  },
  {
    key: "exterior",
    title: "Roof, Gutters & Exterior",
    icon: "🏠",
    matchSections: ["roof", "exterior", "gutter", "foundation", "structure", "basement", "crawlspace", "grounds", "site"],
    tips: [
      {
        task: "Clean the gutters",
        cadence: "At least twice a year",
        detail:
          "Clear gutters and downspouts in spring and fall (more often with nearby trees). Clogged gutters can send water toward the foundation and under the roof edge.",
      },
      {
        task: "Direct water away from the home",
        cadence: "Seasonally",
        detail:
          "Make sure the ground slopes away from the foundation and downspouts discharge 4–6 feet out. Good drainage is one of the best protections against basement and foundation issues.",
      },
      {
        task: "Re-caulk and seal",
        cadence: "Yearly",
        detail:
          "Inspect and touch up caulk/sealant around windows, doors, trim, and where different materials meet. Sealing gaps keeps out water and pests and helps energy efficiency.",
      },
      {
        task: "Look over the roof after storms",
        cadence: "After major storms",
        detail:
          "From the ground (binoculars help), look for lifted, missing, or damaged shingles and flashing after heavy wind or hail, and have a professional take a closer look if anything looks off.",
      },
    ],
  },
  {
    key: "interior",
    title: "Interior & Appliances",
    icon: "🧰",
    matchSections: ["interior", "appliance", "kitchen", "door", "window", "laundry"],
    tips: [
      {
        task: "Clean refrigerator coils",
        cadence: "1–2 times a year",
        detail:
          "Vacuum the condenser coils (usually behind or beneath the fridge) once or twice a year so it runs efficiently and lasts.",
      },
      {
        task: "Run water in unused drains",
        cadence: "Monthly",
        detail:
          "Run water briefly in seldom-used sinks, tubs, and floor drains monthly so the traps don't dry out and let sewer odors in.",
      },
      {
        task: "Check weatherstripping",
        cadence: "Seasonally",
        detail:
          "Inspect the seals around exterior doors and windows; replacing worn weatherstripping keeps drafts out and comfort (and efficiency) up.",
      },
      {
        task: "Clean range hood filter",
        cadence: "Every 1–3 months",
        detail:
          "Wash or replace the range-hood grease filter regularly so it vents properly.",
      },
    ],
  },
];

export const MAINTENANCE_DISCLAIMER =
  "These are general guidelines to help you care for your home — actual intervals vary with your equipment, usage, and local conditions. Always follow the manufacturer's instructions, and use a licensed professional for service, repairs, or anything you're unsure about. This maintenance guide is provided as a courtesy and is not part of the inspection findings.";

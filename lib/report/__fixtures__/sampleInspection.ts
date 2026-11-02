// Synthetic, PII-free inspection fixture for the report golden-master test.
//
// It is deliberately loaded with the edge cases that have caused "surfaces
// disagree" bugs: multi-keyword severities, mixed-case / sentinel checklist
// rows, section names that need aliasing, radon at every EPA band, and
// combined environmental services. When a Tier-2 refactor moves rendering
// logic into lib/report/*, extend this fixture + the golden-master test so the
// snapshot keeps covering the new path. Nothing here is real client data.

export const SAMPLE_INSPECTION = {
  id: 90210,
  service_mode: "home",
  inspection_type: "Home Inspection + Radon + Mold",
  services: "home_radon_mold",
  radon: true,
  mold: true,
  radon_test: { average_pci: 4.6 }, // a joined OBJECT, must NOT read as true
};

// Inspections that each isolate one service-detection branch.
export const SERVICE_CASES = [
  { label: "home only", inspection: { service_mode: "home" } },
  { label: "radon via boolean", inspection: { service_mode: "home", radon: true } },
  {
    label: "radon shadowed by service_mode=home (the asymmetry bug)",
    inspection: { service_mode: "home", inspection_type: "Radon Test" },
  },
  { label: "mold standalone", inspection: { service_mode: "mold" } },
  { label: "both", inspection: { services: "home_radon_mold" } },
  { label: "neither", inspection: { service_mode: "home", inspection_type: "Buyer" } },
];

// Radon averages at and around each EPA threshold.
export const RADON_AVERAGES = [0, 1.1, 1.9, 2, 3.9, 4, 4.6, 7.3];

// Free-text severities, including the multi-keyword ones that diverged.
export const SEVERITIES = [
  "Safety Concern",
  "Major Defect",
  "Recommended Repair",
  "Minor Defect", // repair + maintenance tokens -> must bucket repair
  "Minor Repair",
  "Maintenance Item",
  "Monitor",
  "Information",
  "Custom Company Label", // unknown -> default bucket
  "",
  null,
];

// Section names as stored, including ones that must alias to a canonical name.
export const SECTIONS = [
  "General",
  "Safety",
  "Appliances",
  "Built In Appliances",
  "Attic/Insulation & Ventilation",
  "Roof",
  "",
  null,
];

// Checklist selections covering the "OTHER" / sentinel handling across cases.
export const CHECKLIST_ROWS = [
  { value: "Asphalt Shingle", custom_text: "" },
  { value: "OTHER", custom_text: "Clay tile" },
  { value: "other", custom_text: "Rolled membrane" }, // lower-case must still be custom
  { value: "Other", custom_text: "" }, // custom but blank -> dropped
  { value: "__TEXT_VALUE__", custom_text: "Field note" },
  { value: "__TEXT_VALUE__", custom_text: "" }, // sentinel but blank -> dropped
];

// Findings with varied title / group field shapes for the field-resolution
// helpers: the fallback chain, the "1.2.3 - " numeric-prefix strip, and defaults.
export const FINDINGS = [
  { title: "Roof covering past service life", component: "Roof" },
  { finding_title: "1.2.3 - Cracked heat exchanger", system: "HVAC" },
  { defect_title: "GFCI protection missing", category: "Electrical" },
  { name: "Loose stair railing", subsection: "Stairs" },
  { title: "4.5.6: Imported-style numbered title", group_title: "Interior" },
  {}, // -> "Untitled Finding" / "General"
];

// Equipment values for the equipment-info helpers — chosen to hit each branch:
// plain label, explicit year range, single number (-> derived range), the
// cautious-wording "remaining service life" path, blocklist values, and blank.
export const EQUIPMENT_VALUES = [
  "Furnace",
  "Water Heater (12-15 years)", // explicit range -> "12–15 years"
  "20", // single number -> "15–20 years"
  "15 years remaining", // cautious-wording branch -> "No specific deficiency noted"
  "Unknown", // blocklist -> known:false
  "N/A", // blocklist -> known:false
  "",
];

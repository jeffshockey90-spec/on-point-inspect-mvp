export type FindingDraft = {
  kind: "finding";
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  confidence?: number;
  // Material/type fields the AI identified for this finding's section, keyed by
  // checklist group title (e.g. { "Siding Material": "Vinyl" }). Used to
  // auto-fill the section's system-info checklist. See lib/ai/checklistAutofill.
  sectionInfo?: Record<string, string>;
};

export type LimitationDraft = {
  kind: "limitation";
  title: string;
  section: string;
  limitation: string;
  reason?: string;
  recommendation?: string;
  confidence?: number;
};

// Mirrors the shape returned by /api/analyze-equipment (EquipmentResult in
// app/field/page.tsx) without importing from a "use client" page module.
export type EquipmentDraft = {
  kind: "equipment";
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  manufactureYear?: string | number;
  condition?: string;
  section?: string;
  severity?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
  // Rich equipment intelligence the analyzer also returns. Displayed read-only
  // in the confirm card so the inspector sees the full record before saving.
  estimatedAge?: string | number;
  expectedServiceLife?: string;
  estimatedLifeRemaining?: string;
  lifeExpectancyPercent?: number;
  maintenanceSchedule?: string;
  maintenanceLevel?: string;
  replacementCostEstimate?: string;
  recallAwareness?: string;
  knownFailurePatterns?: string[];
  equipmentStatus?: string;
  equipmentCategory?: string;
  estimatedBTU?: string;
  capacity?: string;
  fuelType?: string;
  refrigerant?: string;
  efficiency?: string;
  estimatedSEER?: string;
  estimatedAFUE?: string;
  estimatedHeatingEfficiency?: string;
  clientSummary?: string;
  confidenceScore?: number | string;
  error?: string;
  [key: string]: unknown;
};

export type ReferenceDraft = {
  kind: "reference";
  caption: string;
};

export type CaptureDraft =
  | FindingDraft
  | LimitationDraft
  | EquipmentDraft
  | ReferenceDraft;

export type CaptureCategory = CaptureDraft["kind"];

// Kept in sync with VALID_SECTIONS/VALID_SEVERITIES in
// app/api/ai-capture/route.ts and app/api/ai/live-inspection-camera/route.ts.
export const SECTION_OPTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

export const SEVERITY_OPTIONS = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

export type FindingDraft = {
  kind: "finding";
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  confidence?: number;
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

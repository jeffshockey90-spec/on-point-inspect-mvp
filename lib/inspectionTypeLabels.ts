// Readable service labels for an inspection, for the Reports cards: e.g.
// ["Home Inspection", "Radon"], ["Pre Offer Verbal Walkthrough"],
// ["Re-Inspection"], plus priced add-ons (Sewer Scope, Termite / WDO...).
// Works from service_mode (New Inspection), the booking service text, and the
// per-service fee map. Pure.

import { serviceLabelForKey } from "./refundMath";

const key = (v: unknown) =>
  String(v || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const SKIP_FEE_KEYS = new Set(["home", "home_inspection", "radon", "radon_test", "mold", "mold_testing", "travel", "travel_fee", "discount", "total"]);

export function inspectionTypeLabels(inspection: Record<string, any> | null | undefined): string[] {
  if (!inspection) return [];
  const out: string[] = [];
  const add = (label: string) => {
    const clean = String(label || "").trim();
    if (clean && !out.some((l) => l.toLowerCase() === clean.toLowerCase())) out.push(clean);
  };

  if (inspection.parent_inspection_id) add("Re-Inspection");

  const mode = key(inspection.service_mode);
  if (inspection.is_orientation === true || mode === "home_orientation") {
    add("Home Orientation");
  } else if (mode) {
    const builtIn = /^(home|radon|mold)(_(home|radon|mold|only))*$/.test(mode);
    if (builtIn) {
      if (mode.includes("home")) add("Home Inspection");
      if (mode.includes("radon")) add("Radon");
      if (mode.includes("mold")) add("Mold");
    } else {
      add(serviceLabelForKey(mode)); // custom main service, e.g. Pre-Listing
    }
  } else {
    // Older / booked jobs: the requested-services text ("Buyer Home Inspection, Radon Testing").
    const text = String(inspection.service_type || inspection.inspection_type || inspection.services || "");
    for (const part of text.split(/[,+]/)) {
      const p = part.trim();
      if (p) add(p);
    }
    if (!out.length || (out.length === 1 && out[0] === "Re-Inspection")) {
      if (inspection.radon === true) add("Radon");
      if (inspection.mold === true) add("Mold");
    }
  }

  // Priced add-ons on the job.
  const fees = inspection.service_fees;
  if (fees && typeof fees === "object") {
    for (const [k, v] of Object.entries(fees)) {
      const fk = key(k);
      if (!fk || SKIP_FEE_KEYS.has(fk) || fk === mode) continue;
      if (Number(v) > 0) add(serviceLabelForKey(fk));
    }
  }
  return out;
}

import { describe, expect, it } from "vitest";
import {
  normalizeIdentifyResult,
  IDENTIFY_SECTIONS,
  IDENTIFY_SEVERITIES,
} from "./identifyResult";

describe("normalizeIdentifyResult", () => {
  it("keeps a clean, valid result and resolves a known hazard", () => {
    const r = normalizeIdentifyResult({
      label: "Federal Pacific Stab-Lok electrical panel",
      componentType: "electrical panel",
      section: "Electrical",
      hazard: true,
      hazardNote: "FPE panels have a history of breakers that fail to trip.",
      severity: "Safety Concern",
      confidence: 88,
      worthLogging: true,
    });
    expect(r.label).toBe("Federal Pacific Stab-Lok electrical panel");
    expect(r.section).toBe("Electrical");
    expect(r.severity).toBe("Safety Concern");
    expect(r.hazard).toBe(true);
    expect(r.worthLogging).toBe(true);
    expect(r.confidence).toBe(88);
  });

  it("falls back to the camera's section when the model gives an invalid one", () => {
    const r = normalizeIdentifyResult({ label: "Water heater", section: "Nonsense" }, "Plumbing");
    expect(r.section).toBe("Plumbing");
    expect(IDENTIFY_SECTIONS.includes(r.section as any)).toBe(true);
  });

  it("defaults to Exterior when neither model nor fallback section is valid", () => {
    const r = normalizeIdentifyResult({ label: "Thing" }, "Bogus");
    expect(r.section).toBe("Exterior");
  });

  it("stays conservative on severity: unknown/blank -> Informational", () => {
    expect(normalizeIdentifyResult({ label: "Outlet", severity: "" }).severity).toBe("Informational");
    expect(normalizeIdentifyResult({ label: "Outlet", severity: "weird" }).severity).toBe("Informational");
    expect(IDENTIFY_SEVERITIES.includes(normalizeIdentifyResult({ label: "x" }).severity as any)).toBe(true);
  });

  it("nudges near-miss severity phrasings onto a canonical label", () => {
    expect(normalizeIdentifyResult({ label: "x", severity: "safety hazard" }).severity).toBe("Safety Concern");
    expect(normalizeIdentifyResult({ label: "x", severity: "needs repair" }).severity).toBe("Recommended Repair");
    expect(normalizeIdentifyResult({ label: "x", severity: "major defect" }).severity).toBe("Major Concern");
  });

  it("marks a known hazard as worth logging even if the flag is omitted", () => {
    const r = normalizeIdentifyResult({ label: "Zinsco panel", hazard: true });
    expect(r.worthLogging).toBe(true);
    // A hazard with no explicit severity defaults to Safety Concern.
    expect(r.severity).toBe("Safety Concern");
  });

  it("accepts snake_case and stringy booleans from the model", () => {
    const r = normalizeIdentifyResult({
      label: "TPR valve",
      component_type: "pressure relief valve",
      hazard: "true",
      hazard_note: "No discharge pipe present.",
      worth_logging: "yes",
      confidence: "72",
    });
    expect(r.componentType).toBe("pressure relief valve");
    expect(r.hazard).toBe(true);
    expect(r.worthLogging).toBe(true);
    expect(r.confidence).toBe(72);
  });

  it("clamps out-of-range confidence and handles junk input", () => {
    expect(normalizeIdentifyResult({ label: "x", confidence: 999 }).confidence).toBe(100);
    expect(normalizeIdentifyResult({ label: "x", confidence: -5 }).confidence).toBe(0);
    const empty = normalizeIdentifyResult(null);
    expect(empty.label).toBe("Unidentified component");
    expect(empty.section).toBe("Exterior");
    expect(empty.severity).toBe("Informational");
    expect(empty.worthLogging).toBe(false);
  });

  it("falls back the label to the component type when no label is given", () => {
    expect(normalizeIdentifyResult({ componentType: "furnace" }).label).toBe("furnace");
  });
});

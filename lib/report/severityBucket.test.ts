import { describe, expect, it } from "vitest";
import { severityBucket } from "./severityBucket";

// Characterization tests pinning the single canonical bucketing precedence that
// all three report surfaces (share page, print page, realtor PDF) now share.
describe("severityBucket", () => {
  it("buckets the safety family first", () => {
    expect(severityBucket("Safety Concern")).toBe("safety");
    expect(severityBucket("Safety Hazard")).toBe("safety");
    expect(severityBucket("Major Defect")).toBe("safety");
    expect(severityBucket("Fire Hazard")).toBe("safety");
  });

  it("buckets the repair family", () => {
    expect(severityBucket("Recommended Repair")).toBe("repair");
    expect(severityBucket("Repair")).toBe("repair");
    expect(severityBucket("Defect")).toBe("repair");
  });

  it("buckets the maintenance family", () => {
    expect(severityBucket("Maintenance")).toBe("maintenance");
    expect(severityBucket("Monitor")).toBe("maintenance");
    expect(severityBucket("Minor")).toBe("maintenance");
  });

  it("buckets the information family", () => {
    expect(severityBucket("Informational")).toBe("information");
    expect(severityBucket("Info")).toBe("information");
    expect(severityBucket("Client Note")).toBe("information");
  });

  // Precedence: safety outranks everything, then repair outranks maintenance.
  it("prefers safety over every other family when both keywords appear", () => {
    expect(severityBucket("Major Repair")).toBe("safety");
    expect(severityBucket("Safety Maintenance")).toBe("safety");
    expect(severityBucket("Hazard - Monitor")).toBe("safety");
  });

  // This is the convergence case: "Minor Defect" contains both "defect"
  // (repair family) and "minor" (maintenance family). The canonical precedence
  // runs the repair branch first, so it is "repair" everywhere. Print and the
  // realtor PDF previously classified this as maintenance.
  it("prefers repair over maintenance when both keywords appear (convergence case)", () => {
    expect(severityBucket("Minor Defect")).toBe("repair");
    expect(severityBucket("Minor Repair")).toBe("repair");
    expect(severityBucket("Monitor / Repair")).toBe("repair");
    expect(severityBucket("Defect - Monitor")).toBe("repair");
  });

  it("defaults empty / falsy input to repair", () => {
    expect(severityBucket("")).toBe("repair");
    expect(severityBucket(null)).toBe("repair");
    expect(severityBucket(undefined)).toBe("repair");
    expect(severityBucket(0)).toBe("repair");
  });

  it("defaults an unrecognized custom label to repair", () => {
    expect(severityBucket("Cosmetic")).toBe("repair");
    expect(severityBucket("Needs Review")).toBe("repair");
  });

  it("is case-insensitive", () => {
    expect(severityBucket("SAFETY")).toBe("safety");
    expect(severityBucket("minor defect")).toBe("repair");
    expect(severityBucket("MAINTENANCE")).toBe("maintenance");
  });
});

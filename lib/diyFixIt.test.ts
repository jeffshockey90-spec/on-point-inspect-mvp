import { describe, expect, it } from "vitest";
import { matchDiyFixIt, buildDiyFixIts, isDiyVetoed } from "./diyFixIt";

describe("matchDiyFixIt — safe matches", () => {
  it("matches worn caulking to the caulk kit", () => {
    const kit = matchDiyFixIt({ title: "Deteriorated caulking at bathtub", section: "Bathrooms", severity: "Maintenance" });
    expect(kit?.task).toMatch(/caulk/i);
    expect(kit?.materials.length).toBeGreaterThan(0);
    expect(kit?.difficulty).toBe("Easy");
    expect(kit?.costLow).toBeLessThanOrEqual(kit!.costHigh);
  });

  it("matches a running toilet", () => {
    expect(matchDiyFixIt({ title: "Running toilet in hall bath", severity: "Recommended Repair" })?.task).toMatch(/flapper|fill valve/i);
  });

  it("matches a dirty furnace filter to the air-filter kit (not vetoed by HVAC words)", () => {
    const kit = matchDiyFixIt({ title: "Dirty furnace filter", section: "Heating", severity: "Maintenance" });
    expect(kit?.task).toMatch(/air filter/i);
  });

  it("keeps the real finding title on the kit", () => {
    expect(matchDiyFixIt({ title: "Clogged aerator at kitchen sink", severity: "Monitor" })?.findingTitle).toBe("Clogged aerator at kitchen sink");
  });
});

describe("matchDiyFixIt — hard safety vetoes", () => {
  const dangerous: Array<[string, Partial<{ title: string; section: string; severity: string }>]> = [
    ["electrical panel", { title: "Double-tapped breaker in panel", section: "Electrical" }],
    ["gas", { title: "Gas leak odor near furnace", section: "Heating" }],
    ["structural", { title: "Cracked foundation wall with settlement", section: "Structure" }],
    ["roof / height", { title: "Missing shingles on roof", section: "Roof" }],
    ["gutter (height)", { title: "Gutters need cleaning", section: "Exterior" }],
    ["water heater", { title: "No TPR discharge pipe on water heater", section: "Plumbing" }],
    ["mold", { title: "Suspected mold at basement wall", section: "Basement" }],
    ["sewer", { title: "Sewer line backup observed", section: "Plumbing" }],
  ];

  it.each(dangerous)("never offers a kit for %s", (_label, finding) => {
    expect(matchDiyFixIt(finding)).toBeNull();
    expect(isDiyVetoed(finding)).toBe(true);
  });

  it("vetoes anything flagged Safety Concern even with a DIY-looking title", () => {
    // Caulk would normally match, but a safety flag means hands off.
    expect(matchDiyFixIt({ title: "Caulking failed at window", severity: "Safety Concern" })).toBeNull();
  });

  it("vetoes anything flagged Major Concern", () => {
    expect(matchDiyFixIt({ title: "Loose cabinet hinge", severity: "Major Concern" })).toBeNull();
  });

  it("veto wins when a safe trigger and a danger word both appear", () => {
    // 'caulk' matches, but 'roof' vetoes.
    expect(matchDiyFixIt({ title: "Recaulk the roof penetration flashing", severity: "Maintenance" })).toBeNull();
  });
});

describe("matchDiyFixIt — no match", () => {
  it("returns null for an unrelated finding", () => {
    expect(matchDiyFixIt({ title: "Window glazing is cloudy (failed seal)", severity: "Monitor" })).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(matchDiyFixIt({})).toBeNull();
  });
});

describe("buildDiyFixIts", () => {
  it("dedupes the same task across findings", () => {
    const list = buildDiyFixIts([
      { title: "Caulking worn at tub", severity: "Maintenance" },
      { title: "Caulking missing at shower", severity: "Maintenance" },
    ]);
    expect(list).toHaveLength(1);
  });

  it("drops dangerous findings while keeping safe ones", () => {
    const list = buildDiyFixIts([
      { title: "Running toilet", severity: "Recommended Repair" },
      { title: "Overloaded electrical panel", severity: "Safety Concern" },
      { title: "Dirty air filter", severity: "Maintenance" },
    ]);
    const tasks = list.map((k) => k.task);
    expect(tasks.some((t) => /flapper|fill valve/i.test(t))).toBe(true);
    expect(tasks.some((t) => /air filter/i.test(t))).toBe(true);
    expect(tasks.some((t) => /panel|electric/i.test(t))).toBe(false);
  });

  it("respects the cap", () => {
    const many = [
      { title: "caulk worn" }, { title: "weatherstrip worn" }, { title: "door sweep missing" },
      { title: "running toilet" }, { title: "clogged aerator" }, { title: "dirty air filter" },
      { title: "loose hinge" }, { title: "cracked grout" }, { title: "nail pops in drywall" },
    ];
    expect(buildDiyFixIts(many, 3)).toHaveLength(3);
  });

  it("returns an empty list when nothing qualifies", () => {
    expect(buildDiyFixIts([{ title: "Gas furnace at end of life", severity: "Major Concern" }])).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { sectionsWithContent } from "./sectionsWithContent";

describe("sectionsWithContent", () => {
  it("keeps active order and appends sections outside the active list", () => {
    const map = { Roof: [1], Exterior: [2], Shed: [3], Empty: [] as number[] };
    expect(sectionsWithContent(["Exterior", "Roof", "Garage"], map)).toEqual(["Exterior", "Roof", "Shed"]);
  });
  it("handles object-valued maps (checklists) and empty input", () => {
    expect(sectionsWithContent(["Roof"], { Roof: { Covering: ["Asphalt"] }, Pool: { Type: ["Inground"] } })).toEqual(["Roof", "Pool"]);
    expect(sectionsWithContent(["Roof"], null)).toEqual([]);
  });
});

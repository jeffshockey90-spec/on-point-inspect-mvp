import { describe, it, expect } from "vitest";
import { isOrientationJob } from "./orientation";

describe("isOrientationJob", () => {
  it("recognizes the flag or the service mode", () => {
    expect(isOrientationJob({ is_orientation: true })).toBe(true);
    expect(isOrientationJob({ service_mode: "home_orientation" })).toBe(true);
    expect(isOrientationJob({ service_mode: "Home Orientation" })).toBe(true);
  });
  it("is false for regular jobs", () => {
    expect(isOrientationJob({ service_mode: "home_inspection" })).toBe(false);
    expect(isOrientationJob({ service_mode: "Home Inspection", is_orientation: false })).toBe(false);
    expect(isOrientationJob(null)).toBe(false);
  });
});

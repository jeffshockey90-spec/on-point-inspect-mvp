import { describe, expect, it } from "vitest";
import { REPORT_UI_STRINGS } from "./uiStrings";

describe("REPORT_UI_STRINGS", () => {
  it("covers the report tabs, portal actions and home hub chrome", () => {
    for (const label of ["Findings Summary", "Executive Summary", "Payment Summary", "Sign Agreement", "Almost ready"]) {
      expect(REPORT_UI_STRINGS).toContain(label);
    }
  });

  it("has only clean, non-empty labels (exact-match keys)", () => {
    for (const label of REPORT_UI_STRINGS) {
      expect(label.trim()).toBe(label);
      expect(label.length).toBeGreaterThan(1);
      expect(label).not.toMatch(/[{}<>]/);
    }
  });
});

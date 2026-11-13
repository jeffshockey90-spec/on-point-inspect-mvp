import { describe, it, expect } from "vitest";
import { HOME_ORIENTATION_AGREEMENT, STARTER_AGREEMENTS } from "./starterAgreements";

describe("Home Orientation starter agreement", () => {
  const { body, service_type, state } = HOME_ORIENTATION_AGREEMENT;

  it("is listed among the starter agreements", () => {
    expect(STARTER_AGREEMENTS).toContain(HOME_ORIENTATION_AGREEMENT);
  });

  it("is a GENERAL / any-state template", () => {
    expect(state).toBe("GENERAL");
  });

  it('uses the "orientation" service_type with no "home" substring', () => {
    // The agreement picker matches "home" by substring; a service_type containing
    // "home" would cross-attach this agreement to a plain home inspection.
    expect(service_type).toBe("orientation");
    expect(service_type.includes("home")).toBe(false);
  });

  it("explicitly scopes itself as NOT a home inspection", () => {
    expect(body).toMatch(/NOT a home inspection/i);
    expect(body).toMatch(/Standard of Practice/i);
    expect(body).toMatch(/does NOT produce a home-inspection report/i);
  });

  it("carries the merge fields the agreement renderer fills", () => {
    for (const field of [
      "{{CLIENT_NAME}}",
      "{{PROPERTY_ADDRESS}}",
      "{{INSPECTION_FEE}}",
      "{{INSPECTION_DATE}}",
      "{{INSPECTOR_COMPANY}}",
      "{{SIGNED_DATE}}",
    ]) {
      expect(body).toContain(field);
    }
  });

  it("follows the cautious-wording rule (frames service life, disclaims failure predictions)", () => {
    expect(body).toMatch(/typical range together with ordinary maintenance/i);
    // Any mention of failure must be a disclaimer of predicting it, never an
    // assertion that a component WILL fail.
    expect(body).toMatch(/not as a prediction that a component will fail/i);
  });
});

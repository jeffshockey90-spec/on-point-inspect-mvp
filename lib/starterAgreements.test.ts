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

  it("explicitly scopes itself as NOT a home inspection (and not a reinspection)", () => {
    expect(body).toMatch(/not a home inspection or reinspection/i);
    expect(body).toMatch(/Standard of Practice/i);
    expect(body).toMatch(/does not include a formal home inspection report/i);
    // Keeps an existing client's prior inspection + report untouched.
    expect(body).toMatch(/verifying previously recommended repairs/i);
    expect(body).toMatch(/any previous home inspection performed by the company remains subject to its original agreement/i);
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

  it("follows the cautious-wording rule (frames service life, disclaims remaining-life predictions)", () => {
    expect(body).toMatch(/not a prediction of actual remaining life/i);
    expect(body).toMatch(/no warranty or guarantee/i);
  });
});

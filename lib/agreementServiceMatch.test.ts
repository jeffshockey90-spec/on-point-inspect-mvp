import { describe, expect, it } from "vitest";
import { agreementCategoriesForInspection, pickAgreementTemplates, templateMatchesService } from "./agreementServiceMatch";

const templates = [
  { id: "home-md", state: "MD", is_default: true, service_type: "home_inspection" },
  { id: "home-gen", state: "GENERAL", is_default: true, service_type: "home_inspection" },
  { id: "radon", state: "GENERAL", is_default: true, service_type: "radon_test" },
  { id: "mold", state: "GENERAL", is_default: false, service_type: "mold_testing" },
  { id: "prelist", state: "GENERAL", is_default: false, service_type: "pre_listing_inspection" },
  { id: "ms", state: "GENERAL", is_default: true, service_type: "mechanical_and_structural" },
  { id: "orient", state: "GENERAL", is_default: true, service_type: "orientation" },
  { id: "sewer", state: "GENERAL", is_default: true, service_type: "sewer_scope" },
];

describe("agreement per service", () => {
  it("matches built-ins and custom services by name", () => {
    expect(templateMatchesService(templates[4], "pre_listing")).toBe(true);
    expect(templateMatchesService(templates[4], "Pre-Listing Inspection")).toBe(true);
    expect(templateMatchesService(templates[6], "home")).toBe(false);
    expect(templateMatchesService(templates[0], "pre_listing_inspection")).toBe(false);
  });

  it("finds the categories on a job", () => {
    expect(agreementCategoriesForInspection({ service_mode: "home_radon", radon: true })).toEqual(["home", "radon"]);
    expect(agreementCategoriesForInspection({ service_mode: "pre_listing_inspection" })).toEqual(["pre_listing_inspection"]);
    expect(agreementCategoriesForInspection({ service_mode: "home_orientation" })).toEqual(["orientation"]);
    expect(agreementCategoriesForInspection({ service_type: "Buyer Home Inspection, Radon Testing" })).toEqual(["home", "radon"]);
    expect(
      agreementCategoriesForInspection({ service_mode: "home", service_fees: { home: 450, sewer_scope: 200, travel: 25 } }),
    ).toEqual(["home", "sewer_scope"]);
  });

  it("picks one per service, state-specific and default first", () => {
    const picked = pickAgreementTemplates(templates, ["home", "radon", "mold", "sewer_scope"], "MD").map((t) => t.id);
    expect(picked).toEqual(["home-md", "radon", "mold", "sewer"]);
    expect(pickAgreementTemplates(templates, ["home"], "PA").map((t) => t.id)).toEqual(["home-gen"]);
    expect(pickAgreementTemplates(templates, ["mechanical_and_structural"], "KY").map((t) => t.id)).toEqual(["ms"]);
  });
});

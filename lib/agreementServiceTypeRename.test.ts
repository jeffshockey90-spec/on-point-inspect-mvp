import { describe, expect, it } from "vitest";
import { renameTarget, templatesUsingServiceType } from "./agreementServiceTypeRename";

describe("agreement service type rename", () => {
  const templates = [
    { id: 1, service_type: "pre_listing" },
    { id: 2, service_type: "pre_listing_inspection" },
    { id: 3, template_type: "Pre Listing" },
    { id: 4, service_type: "home_inspection" },
  ];

  it("finds every template with the type, however it was stored", () => {
    expect(templatesUsingServiceType(templates, "pre_listing").map((t) => t.id)).toEqual([1, 3]);
    expect(templatesUsingServiceType(templates, "")).toEqual([]);
  });

  it("slugs the typed name and ignores blank or unchanged names", () => {
    expect(renameTarget("pre_listing", "Pre Listing Inspection")).toBe("pre_listing_inspection");
    expect(renameTarget("pre_listing", "  pre listing ")).toBe("");
    expect(renameTarget("pre_listing", "")).toBe("");
  });
});

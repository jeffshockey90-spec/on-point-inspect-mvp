import { describe, expect, it } from "vitest";
import { normalizeWorkspaceTab, sectionAnchorId, tabForAnchor, workspaceTabHref } from "./workspaceTabs";

describe("normalizeWorkspaceTab", () => {
  it("defaults to write for missing or unknown values", () => {
    expect(normalizeWorkspaceTab(undefined)).toBe("write");
    expect(normalizeWorkspaceTab("nope")).toBe("write");
  });
  it("accepts client and insights, including array params", () => {
    expect(normalizeWorkspaceTab("client")).toBe("client");
    expect(normalizeWorkspaceTab(["insights"])).toBe("insights");
  });
});

describe("tabForAnchor", () => {
  it("routes status-chip anchors to the tab that renders them", () => {
    expect(tabForAnchor("#agreement-status")).toBe("client");
    expect(tabForAnchor("payment-invoice")).toBe("client");
    expect(tabForAnchor("#report-actions")).toBe("write");
    expect(tabForAnchor("#ai-insights")).toBe("insights");
  });
  it("routes findings sections to write", () => {
    expect(tabForAnchor(sectionAnchorId("Roof"))).toBe("write");
  });
  it("leaves anchors that every tab renders alone", () => {
    expect(tabForAnchor("#repair-request-history")).toBeNull();
    expect(tabForAnchor("")).toBeNull();
  });
});

describe("sectionAnchorId", () => {
  it("matches ReportFindingsSortable's section slug", () => {
    expect(sectionAnchorId("Heating / Cooling (HVAC)")).toBe("report-section-heating-cooling-hvac");
  });
});

describe("workspaceTabHref", () => {
  it("builds tab links with an optional anchor", () => {
    expect(workspaceTabHref("client", "payment-invoice")).toBe("?tab=client#payment-invoice");
    expect(workspaceTabHref("write")).toBe("?tab=write");
    expect(workspaceTabHref("write", "report-findings")).toBe("?tab=write#report-findings");
  });
});

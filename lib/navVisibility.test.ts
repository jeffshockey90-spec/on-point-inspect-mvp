import { describe, expect, it } from "vitest";
import { isPortalRoute } from "./navVisibility";

describe("isPortalRoute", () => {
  it("treats public/client-facing routes as portal routes (no nav shell)", () => {
    expect(isPortalRoute("/login")).toBe(true);
    expect(isPortalRoute("/signup")).toBe(true);
    expect(isPortalRoute("/share/abc123")).toBe(true);
    expect(isPortalRoute("/client-portal/64")).toBe(true);
    expect(isPortalRoute("/client-agreement/64")).toBe(true);
    expect(isPortalRoute("/environmental-share/64")).toBe(true);
    expect(isPortalRoute("/repair-request?inspection_id=64")).toBe(true);
    expect(isPortalRoute("/repair-response/abc123")).toBe(true);
  });

  it("treats the inspector app routes as non-portal (nav shell shows)", () => {
    expect(isPortalRoute("/")).toBe(false);
    expect(isPortalRoute("/reports")).toBe(false);
    expect(isPortalRoute("/reports/64")).toBe(false);
    expect(isPortalRoute("/reports/64/print")).toBe(false);
    expect(isPortalRoute("/settings")).toBe(false);
    expect(isPortalRoute("/dashboard/owner")).toBe(false);
  });

  it("documents a known prefix-matching quirk: /client also matches /clients", () => {
    // The "/client" prefix (meant for /client/[id]) also matches any route
    // starting with those letters, e.g. a hypothetical "/clients" page.
    // Harmless today since no such page is linked from the app, but if one
    // is ever added it will unexpectedly render without the nav shell.
    expect(isPortalRoute("/client")).toBe(true);
    expect(isPortalRoute("/clients")).toBe(true);
  });
});

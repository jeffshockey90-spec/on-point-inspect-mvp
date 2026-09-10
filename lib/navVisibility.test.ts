import { describe, expect, it } from "vitest";
import { hidesNavShell, isMarketingRoute, isPortalRoute } from "./navVisibility";

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
    expect(isPortalRoute("/forgot-password")).toBe(true);
    expect(isPortalRoute("/reset-password")).toBe(true);
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

  it("does not treat marketing routes as portal routes", () => {
    // They are only bare when signed out, which isPortalRoute cannot know.
    expect(isPortalRoute("/")).toBe(false);
    expect(isPortalRoute("/pricing")).toBe(false);
  });
});

describe("isMarketingRoute", () => {
  it("matches the marketing surfaces", () => {
    expect(isMarketingRoute("/")).toBe(true);
    expect(isMarketingRoute("/pricing")).toBe(true);
    expect(isMarketingRoute("/terms")).toBe(true);
    expect(isMarketingRoute("/privacy")).toBe(true);
  });

  it("matches '/' exactly so it never swallows every route", () => {
    // Every path starts with "/", so "/" must never be a prefix entry.
    expect(isMarketingRoute("/reports")).toBe(false);
    expect(isMarketingRoute("/settings")).toBe(false);
    expect(isMarketingRoute("/dashboard/owner")).toBe(false);
    expect(isMarketingRoute("/field")).toBe(false);
  });

  it("ignores a query string", () => {
    expect(isMarketingRoute("/?ref=postcard")).toBe(true);
    expect(isMarketingRoute("/pricing?plan=founding")).toBe(true);
  });
});

describe("hidesNavShell", () => {
  it("hides the app shell from signed-out visitors on marketing pages", () => {
    // The regression this exists for: the logged-out homepage and pricing page
    // rendered wrapped in the inspector sidebar, chip reading "Signed in".
    expect(hidesNavShell("/", false)).toBe(true);
    expect(hidesNavShell("/pricing", false)).toBe(true);
  });

  it("keeps the nav for a signed-in inspector on those same paths", () => {
    // "/" is the dashboard once you have a session.
    expect(hidesNavShell("/", true)).toBe(false);
    expect(hidesNavShell("/pricing", true)).toBe(false);
  });

  it("hides portal routes regardless of session", () => {
    expect(hidesNavShell("/share/abc123", false)).toBe(true);
    expect(hidesNavShell("/share/abc123", true)).toBe(true);
    expect(hidesNavShell("/login", true)).toBe(true);
  });

  it("keeps the nav on app routes either way", () => {
    expect(hidesNavShell("/reports", true)).toBe(false);
    expect(hidesNavShell("/reports", false)).toBe(false);
  });
});

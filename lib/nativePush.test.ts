import { describe, expect, it } from "vitest";
import { getPushUrl, normalizeDeepLink } from "./nativePush";

describe("normalizeDeepLink", () => {
  it("keeps an app-relative route as-is", () => {
    expect(normalizeDeepLink("/reports/64")).toBe("/reports/64");
    expect(normalizeDeepLink("/dashboard/owner/mail")).toBe("/dashboard/owner/mail");
  });

  it("strips our own host off a full URL so it routes in-app", () => {
    expect(normalizeDeepLink("https://app.flowinspect.app/reports/64?tab=findings")).toBe(
      "/reports/64?tab=findings",
    );
  });

  it("leaves a foreign host alone rather than routing to a path we don't have", () => {
    expect(normalizeDeepLink("https://stripe.com/receipts/abc")).toBe(
      "https://stripe.com/receipts/abc",
    );
  });

  it("returns nothing for junk, so a bad payload can't navigate anywhere", () => {
    expect(normalizeDeepLink("")).toBe("");
    expect(normalizeDeepLink(null)).toBe("");
    expect(normalizeDeepLink(undefined)).toBe("");
    expect(normalizeDeepLink(42 as any)).toBe("");
  });
});

describe("getPushUrl", () => {
  it("reads the APNs custom key, where Capacitor puts it", () => {
    // Anything outside `aps` lands on notification.data.
    const event = { notification: { data: { url: "/reports/64" } } };
    expect(getPushUrl(event)).toBe("/reports/64");
  });

  it("falls back to extra, used by other payload shapes", () => {
    expect(getPushUrl({ notification: { extra: { url: "/schedule" } } })).toBe("/schedule");
  });

  it("accepts the other key names a payload might use", () => {
    expect(getPushUrl({ notification: { data: { deepLink: "/a" } } })).toBe("/a");
    expect(getPushUrl({ notification: { data: { deep_link: "/b" } } })).toBe("/b");
    expect(getPushUrl({ notification: { data: { route: "/c" } } })).toBe("/c");
    expect(getPushUrl({ notification: { link: "/d" } })).toBe("/d");
  });

  it("returns empty when the payload carried no destination", () => {
    expect(getPushUrl({ notification: { data: {} } })).toBe("");
    expect(getPushUrl({})).toBe("");
    expect(getPushUrl(null)).toBe("");
  });
});

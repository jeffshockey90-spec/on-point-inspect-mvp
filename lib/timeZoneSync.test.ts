import { describe, it, expect } from "vitest";
import { decideTimeZoneSync } from "./timeZoneSync";

describe("decideTimeZoneSync", () => {
  it("keeps a zone the user deliberately chose", () => {
    const d = decideTimeZoneSync({ timeZone: "America/Chicago", deviceTimeZone: "America/New_York" }, "America/New_York");
    expect(d).toEqual({ timeZone: "America/Chicago", deviceTimeZone: "America/New_York", changed: false });
  });
  it("records a new device zone without overriding the chosen zone", () => {
    const d = decideTimeZoneSync({ timeZone: "America/Chicago", deviceTimeZone: "America/New_York" }, "America/Denver");
    expect(d).toEqual({ timeZone: "America/Chicago", deviceTimeZone: "America/Denver", changed: true });
  });
  it("follows the device when the user was following it (traveling)", () => {
    const d = decideTimeZoneSync({ timeZone: "America/New_York", deviceTimeZone: "America/New_York" }, "America/Denver");
    expect(d).toEqual({ timeZone: "America/Denver", deviceTimeZone: "America/Denver", changed: true });
  });
  it("adopts the device zone when nothing is saved yet", () => {
    expect(decideTimeZoneSync({}, "America/Phoenix")).toMatchObject({ timeZone: "America/Phoenix", changed: true });
  });
});

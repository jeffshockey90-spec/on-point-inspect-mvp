import { describe, it, expect } from "vitest";
import { reminderDateWindow } from "./reminderWindow";

describe("reminderDateWindow", () => {
  it("covers yesterday through two days out, around a date boundary", () => {
    expect(reminderDateWindow(new Date("2026-11-16T23:30:00Z"))).toEqual({
      fromDate: "2026-11-14",
      toDate: "2026-11-18",
    });
  });
  it("crosses month and year boundaries", () => {
    expect(reminderDateWindow(new Date("2026-12-31T05:00:00Z"))).toEqual({
      fromDate: "2026-12-29",
      toDate: "2027-01-02",
    });
  });
});

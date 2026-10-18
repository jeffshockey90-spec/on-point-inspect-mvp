import { describe, expect, it } from "vitest";
import { formatDateOnly, toLocalDateKey } from "./app-time";

describe("formatDateOnly", () => {
  it("keeps a bare YYYY-MM-DD date on its own day regardless of the renderer's time zone", () => {
    // This is the exact bug class that hit the Invoices list: naively doing
    // `new Date("2026-01-10")` reads as UTC midnight, which formats as Jan 9
    // in any time zone behind UTC (e.g. America/New_York).
    expect(formatDateOnly("2026-01-10")).toBe("Jan 10, 2026");
    expect(formatDateOnly("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("also works when a full timestamp is stored for a date-only value", () => {
    expect(formatDateOnly("2026-01-10T00:00:00.000Z")).toBe("Jan 10, 2026");
  });

  it("returns an em dash for empty input", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly("")).toBe("—");
  });
});

describe("toLocalDateKey", () => {
  it("returns the calendar day in the requested time zone, not UTC's", () => {
    // 2am UTC on Jan 10 is still 9pm Jan 9 in New York (UTC-5).
    expect(toLocalDateKey("2026-01-10T02:00:00Z", "America/New_York")).toBe(
      "2026-01-09",
    );
    expect(toLocalDateKey("2026-01-10T02:00:00Z", "UTC")).toBe("2026-01-10");
  });
});

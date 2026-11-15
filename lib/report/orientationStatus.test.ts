import { describe, it, expect } from "vitest";
import { orientationStatus } from "./orientationStatus";

describe("orientationStatus", () => {
  it("is completed on or after the walkthrough date", () => {
    expect(orientationStatus("2026-11-14", "2026-11-15")).toBe("completed");
    expect(orientationStatus("2026-11-15", "2026-11-15")).toBe("completed");
    expect(orientationStatus("2026-11-14T10:00:00Z", "2026-11-15")).toBe("completed");
  });
  it("is scheduled before the walkthrough date", () => {
    expect(orientationStatus("2026-11-20", "2026-11-15")).toBe("scheduled");
  });
  it("is unknown without a usable date", () => {
    expect(orientationStatus("N/A", "2026-11-15")).toBe("unknown");
    expect(orientationStatus(null, "2026-11-15")).toBe("unknown");
  });
});

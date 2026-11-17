import { describe, expect, it } from "vitest";
import { compareTodayFirst } from "./reportSort";

describe("today-first report order", () => {
  it("puts today first (by time), then upcoming soonest, then past most recent, then undated", () => {
    const rows = [
      { id: "past-old", inspectionDate: "2026-11-01" },
      { id: "undated", inspectionDate: "N/A" },
      { id: "today-2pm", inspectionDate: "2026-11-17", inspectionTime: "14:00" },
      { id: "future-far", inspectionDate: "2026-12-05" },
      { id: "today-9am", inspectionDate: "2026-11-17", inspectionTime: "09:00" },
      { id: "past-recent", inspectionDate: "2026-11-15" },
      { id: "future-soon", inspectionDate: "2026-11-18" },
    ];
    const sorted = [...rows].sort((a, b) => compareTodayFirst(a, b, "2026-11-17")).map((r) => r.id);
    expect(sorted).toEqual(["today-9am", "today-2pm", "future-soon", "future-far", "past-recent", "past-old", "undated"]);
  });
});

import { describe, it, expect } from "vitest";
import { findingInsertRows } from "./findingRows";

describe("findingInsertRows", () => {
  it("never includes inspector_id (findings has no such column)", () => {
    const rows = findingInsertRows(42, 7, [
      { section: "Inspection Details", title: "In Attendance", inspector_id: "u1" } as any,
      { section: "Inspection Details", title: "Occupancy" },
    ]);
    for (const row of rows) expect(row).not.toHaveProperty("inspector_id");
    expect(rows[0]).toMatchObject({ inspection_id: 42, company_id: 7, title: "In Attendance" });
  });
});

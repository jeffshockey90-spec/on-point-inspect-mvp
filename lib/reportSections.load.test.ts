import { describe, it, expect } from "vitest";
import { loadActiveReportSections } from "./reportSections";

// Minimal Supabase-shaped fake for the two queries the loader makes.
function fakeDb(inspection: any, overrides: any[]) {
  return {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: table === "report_section_overrides" ? overrides : [] }),
        maybeSingle: async () => ({ data: table === "inspections" ? inspection : null }),
      };
      return q;
    },
  };
}

describe("loadActiveReportSections", () => {
  it("includes a custom section the inspector added (e.g. Shed)", async () => {
    const db = fakeDb({ service_mode: null, report_section_order: null, template_sections: null }, [
      { section_name: "Shed", is_custom: true, deleted_at: null, sort_order: 99 },
    ]);
    const sections = await loadActiveReportSections(db, 1);
    expect(sections).toContain("Shed");
    expect(sections).toContain("Exterior");
  });

  it("returns [] when the lookup fails", async () => {
    const broken = { from: () => { throw new Error("db down"); } };
    expect(await loadActiveReportSections(broken, 1)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { loadSocialMediaReleaseForInspection } from "./socialMediaRelease";

// Minimal Supabase-shaped fake: tables keyed by name, filtered by one .eq().
function fakeDb(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = tables[table] || [];
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] || null }),
      };
      return q;
    },
  };
}

const companies = [
  { id: "c1", social_media_release_enabled: true, social_media_release_text: "Release text" },
  { id: "c2", social_media_release_enabled: false, social_media_release_text: "Release text" },
  { id: "c3", social_media_release_enabled: true, social_media_release_text: "  " },
];

describe("loadSocialMediaReleaseForInspection", () => {
  it("uses the inspection's company", async () => {
    const db = fakeDb({ companies });
    expect(await loadSocialMediaReleaseForInspection(db, { company_id: "c1" })).toEqual({
      enabled: true,
      text: "Release text",
    });
  });

  it("falls back to the inspector's company when company_id is empty", async () => {
    const db = fakeDb({ companies, company_users: [{ user_id: "u1", company_id: "c1" }] });
    expect((await loadSocialMediaReleaseForInspection(db, { company_id: null, inspector_id: "u1" })).enabled).toBe(true);
  });

  it("is off when the company has it disabled or has no text", async () => {
    const db = fakeDb({ companies });
    expect((await loadSocialMediaReleaseForInspection(db, { company_id: "c2" })).enabled).toBe(false);
    expect((await loadSocialMediaReleaseForInspection(db, { company_id: "c3" })).enabled).toBe(false);
  });

  it("is off when no company can be found", async () => {
    const db = fakeDb({ companies, company_users: [] });
    expect(await loadSocialMediaReleaseForInspection(db, { inspector_id: "nobody" })).toEqual({ enabled: false, text: "" });
    expect(await loadSocialMediaReleaseForInspection(db, null)).toEqual({ enabled: false, text: "" });
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

import { resolvePortalViewerRole } from "./portalViewer";

// Supabase-shaped fake supporting the chain resolvePortalViewerRole uses.
function fakeDb(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = tables[table] || [];
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => String(r[col]) === String(val));
          return q;
        },
        ilike: (col: string, val: string) => {
          rows = rows.filter((r) => String(r[col]).toLowerCase() === val.toLowerCase());
          return q;
        },
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] || null }),
      };
      return q;
    },
  };
}

const db = fakeDb({
  company_users: [{ user_id: "member", company_id: "c1" }],
  inspection_contacts: [{ id: 1, inspection_id: 7, email: "Client@Example.com" }],
});
const inspection = { id: 7, inspector_id: "owner", company_id: "c1" };

describe("resolvePortalViewerRole", () => {
  it("is null when signed out", async () => {
    expect(await resolvePortalViewerRole(db, inspection, null)).toBeNull();
  });
  it("treats the inspector and company members as staff", async () => {
    expect(await resolvePortalViewerRole(db, inspection, { id: "owner" })).toBe("staff");
    expect(await resolvePortalViewerRole(db, inspection, { id: "member" })).toBe("staff");
  });
  it("treats a matching client contact as client (case-insensitive email)", async () => {
    expect(await resolvePortalViewerRole(db, inspection, { id: "c", email: "client@example.com" })).toBe("client");
  });
  it("is null for an unrelated user", async () => {
    expect(await resolvePortalViewerRole(db, inspection, { id: "x", email: "other@example.com" })).toBeNull();
  });
});

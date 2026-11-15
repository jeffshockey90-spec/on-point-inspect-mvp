import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));

import { resolvePortalViewerRole, resolveCardInspection, isStaffPreview, canActOnCard } from "./portalViewer";

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

describe("resolveCardInspection", () => {
  const cardDb = fakeDb({
    inspections: [{ id: 7, public_share_token: "tok-abc", inspector_id: "owner", company_id: "c1" }],
    company_users: [],
    inspection_contacts: [{ id: 1, inspection_id: 7, email: "client@example.com" }],
  });
  const asUser = (u: any) => async () => u;

  it("resolves a share token with no login", async () => {
    const r = await resolveCardInspection(cardDb, "tok-abc", asUser(null));
    expect(r.inspection?.id).toBe(7);
    expect(r.viaRawId).toBe(false);
    expect(isStaffPreview(r)).toBe(false);
    expect(canActOnCard(r)).toBe(true);
  });

  it("refuses a raw id when signed out (no enumeration)", async () => {
    const r = await resolveCardInspection(cardDb, "7", asUser(null));
    expect(r.inspection).toBeNull();
    expect(canActOnCard(r)).toBe(false);
  });

  it("gives staff a read-only preview by raw id", async () => {
    const r = await resolveCardInspection(cardDb, "7", asUser({ id: "owner" }));
    expect(r.inspection?.id).toBe(7);
    expect(isStaffPreview(r)).toBe(true);
    expect(canActOnCard(r)).toBe(false);
  });

  it("lets a signed-in client act by raw id", async () => {
    const r = await resolveCardInspection(cardDb, "7", asUser({ id: "c", email: "client@example.com" }));
    expect(isStaffPreview(r)).toBe(false);
    expect(canActOnCard(r)).toBe(true);
  });

  it("refuses an unrelated signed-in user and unknown tokens", async () => {
    expect((await resolveCardInspection(cardDb, "7", asUser({ id: "x", email: "x@example.com" }))).inspection).toBeNull();
    expect((await resolveCardInspection(cardDb, "nope", asUser(null))).inspection).toBeNull();
  });
});

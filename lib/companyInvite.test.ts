import { describe, it, expect } from "vitest";
import { removeAutoProvisionedCompanies } from "./companyInvite";

// In-memory Supabase-shaped fake that supports the select / count / delete
// chains removeAutoProvisionedCompanies uses, and mutates its tables.
function makeDb(tables: Record<string, any[]>) {
  return {
    tables,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let mode: "select" | "count" | "delete" = "select";
      const rows = () =>
        (tables[table] || []).filter((r) => filters.every(([c, v]) => String(r[c]) === String(v)));
      const q: any = {
        select: (_c: string, opts?: any) => {
          if (opts?.count) mode = "count";
          return q;
        },
        delete: () => {
          mode = "delete";
          return q;
        },
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return q;
        },
        then: (resolve: any) => {
          if (mode === "delete") {
            const hit = new Set(rows());
            tables[table] = (tables[table] || []).filter((r) => !hit.has(r));
            return resolve({ error: null });
          }
          if (mode === "count") return resolve({ count: rows().length, error: null });
          return resolve({ data: rows(), error: null });
        },
      };
      return q;
    },
  };
}

describe("removeAutoProvisionedCompanies", () => {
  it("deletes only the company auto-created for the new user, never one matched by email", async () => {
    const db = makeDb({
      companies: [
        { id: "inviter", email: "owner@inviter.com" },
        { id: "auto-new", email: "info@other.com" },
        // Another tenant whose contact email equals the invitee's email.
        { id: "other-tenant", email: "info@other.com" },
      ],
      company_users: [
        { user_id: "new-user", company_id: "auto-new" },
        { user_id: "other-owner", company_id: "other-tenant" },
      ],
    });

    const deleted = await removeAutoProvisionedCompanies(db, "new-user", "inviter");

    expect(deleted).toEqual(["auto-new"]);
    expect(db.tables.companies.map((c) => c.id).sort()).toEqual(["inviter", "other-tenant"]);
    expect(db.tables.company_users.find((m) => m.user_id === "new-user")).toBeUndefined();
  });

  it("keeps a company that still has other members", async () => {
    const db = makeDb({
      companies: [{ id: "shared" }],
      company_users: [
        { user_id: "new-user", company_id: "shared" },
        { user_id: "someone-else", company_id: "shared" },
      ],
    });
    expect(await removeAutoProvisionedCompanies(db, "new-user", "inviter")).toEqual([]);
    expect(db.tables.companies).toHaveLength(1);
  });

  it("never deletes the inviting company", async () => {
    const db = makeDb({ companies: [{ id: "inviter" }], company_users: [{ user_id: "new-user", company_id: "inviter" }] });
    expect(await removeAutoProvisionedCompanies(db, "new-user", "inviter")).toEqual([]);
    expect(db.tables.companies).toHaveLength(1);
  });
});

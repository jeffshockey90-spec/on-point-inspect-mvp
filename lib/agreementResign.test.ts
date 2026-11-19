import { describe, expect, it } from "vitest";
import { currentTemplateIds, resetAgreementSignatures, templateSelectionChanged } from "./agreementResign";

describe("agreement change re-sign", () => {
  it("detects a real change, ignoring order and duplicates", () => {
    expect(templateSelectionChanged(["a", "b"], ["b", "a"])).toBe(false);
    expect(templateSelectionChanged(["a"], ["a", "a"])).toBe(false);
    expect(templateSelectionChanged(["a"], ["b"])).toBe(true);
    expect(templateSelectionChanged(["a"], ["a", "b"])).toBe(true);
    expect(templateSelectionChanged([], ["a"])).toBe(true);
  });

  it("reads the current selection from either column", () => {
    expect(currentTemplateIds({ agreement_template_ids: [1, 2] })).toEqual(["1", "2"]);
    expect(currentTemplateIds({ agreement_template_ids: [], agreement_template_id: 5 })).toEqual(["5"]);
    expect(currentTemplateIds({})).toEqual([]);
  });

  it("supersedes signed agreements and clears contact signatures", async () => {
    const calls: Array<{ table: string; op: string; payload?: any }> = [];
    const rows: Record<string, any[]> = { inspection_agreements: [{ id: 1 }], inspection_contacts: [{ id: 9 }] };
    const chain = (table: string, op: string, payload?: any) => {
      calls.push({ table, op, payload });
      const q: any = {
        eq: () => q,
        then: (resolve: any) => resolve({ data: op === "select" ? rows[table] || [] : null, error: null }),
      };
      return q;
    };
    const db = {
      from: (table: string) => ({
        select: () => chain(table, "select"),
        update: (payload: any) => chain(table, "update", payload),
      }),
    };
    expect(await resetAgreementSignatures(db, 42)).toBe(true);
    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toEqual([
      { table: "inspection_agreements", op: "update", payload: { status: "superseded" } },
      { table: "inspection_contacts", op: "update", payload: { agreement_signed: false, signed_at: null } },
      { table: "inspections", op: "update", payload: { agreement_status: "pending" } },
    ]);
  });
});

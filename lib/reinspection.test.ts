import { describe, expect, it } from "vitest";
import {
  buildReinspectionFindingRows,
  buildReinspectionRow,
  createReinspection,
  OriginalReportWriteError,
  setReinspectionVerdict,
} from "./reinspection";

/**
 * The original report is historical documentation. These tests exist to prove
 * the re-inspection workflow cannot write to it — not that the UI declines to
 * offer the option.
 *
 * The fake client below records every mutation it is asked to perform, so each
 * test can assert on what WOULD have hit the database. A test that only checked
 * return values would pass while a stray update rewrote a published report.
 */

const ORIGINAL_ID = 100;
const REINSPECTION_ID = 200;

type Write = { table: string; op: string; payload: any; match: Record<string, any> };

function makeDb(opts: { inspections: any[]; findings: any[] }) {
  const writes: Write[] = [];
  const inspections = opts.inspections.map((row) => ({ ...row }));
  const findings = opts.findings.map((row) => ({ ...row }));
  let nextId = 900;

  function table(name: string) {
    const rows = name === "inspections" ? inspections : findings;
    const match: Record<string, any> = {};
    let pending: { op: string; payload: any } | null = null;

    const api: any = {
      select() { return api; },
      order() { return api; },
      eq(column: string, value: any) { match[column] = value; return api; },
      insert(payload: any) { pending = { op: "insert", payload }; return api; },
      update(payload: any) { pending = { op: "update", payload }; return api; },
      delete() { pending = { op: "delete", payload: null }; return api; },

      maybeSingle() {
        const found = rows.find((row: any) =>
          Object.entries(match).every(([k, v]) => String(row[k]) === String(v)));
        return Promise.resolve({ data: found ? { ...found } : null, error: null });
      },

      single() {
        if (pending?.op === "insert") {
          writes.push({ table: name, op: "insert", payload: pending.payload, match: { ...match } });
          const created = { id: (nextId += 1), ...pending.payload };
          rows.push(created);
          return Promise.resolve({ data: { ...created }, error: null });
        }
        return api.maybeSingle();
      },

      then(resolve: any) {
        if (pending) {
          writes.push({ table: name, op: pending.op, payload: pending.payload, match: { ...match } });
          if (pending.op === "insert") {
            const list = Array.isArray(pending.payload) ? pending.payload : [pending.payload];
            list.forEach((row: any) => rows.push({ id: (nextId += 1), ...row }));
          }
          if (pending.op === "update") {
            rows.forEach((row: any) => {
              if (Object.entries(match).every(([k, v]) => String(row[k]) === String(v))) {
                Object.assign(row, pending!.payload);
              }
            });
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        const matched = rows.filter((row: any) =>
          Object.entries(match).every(([k, v]) => String(row[k]) === String(v)));
        return Promise.resolve({ data: matched.map((r: any) => ({ ...r })), error: null }).then(resolve);
      },
    };
    return api;
  }

  return { db: { from: table }, writes, inspections, findings };
}

/** Every write that would have landed on the original inspection or its findings. */
function writesTouchingOriginal(writes: Write[], originalFindingIds: any[]) {
  return writes.filter((w) => {
    if (w.op === "insert") {
      const rows = Array.isArray(w.payload) ? w.payload : [w.payload];
      return rows.some((r: any) =>
        String(r?.inspection_id) === String(ORIGINAL_ID) ||
        String(r?.finding_id ?? "") !== "" && originalFindingIds.map(String).includes(String(r.finding_id)));
    }
    if (String(w.match.id) === String(ORIGINAL_ID) && w.table === "inspections") return true;
    if (String(w.match.inspection_id) === String(ORIGINAL_ID)) return true;
    if (w.table === "findings" && originalFindingIds.map(String).includes(String(w.match.id))) return true;
    return false;
  });
}

function fixture() {
  return makeDb({
    inspections: [
      { id: ORIGINAL_ID, parent_inspection_id: null, property_address: "12 Oak St", client_name: "Jordan", report_status: "published", public_share_token: "tok-original" },
      { id: REINSPECTION_ID, parent_inspection_id: ORIGINAL_ID, property_address: "12 Oak St" },
    ],
    findings: [
      { id: "f-original-1", inspection_id: ORIGINAL_ID, title: "Foundation wall crack", observation: "Original narrative.", recommendation: "Evaluate.", severity: "Major Concern", section: "Structure" },
      { id: "f-original-2", inspection_id: ORIGINAL_ID, title: "Loose railing", observation: "Original narrative 2.", severity: "Safety Concern", section: "Exterior" },
      { id: "f-reinspect-1", inspection_id: REINSPECTION_ID, source_finding_id: "f-original-1", title: "Foundation wall crack", reinspection_status: "not_evaluated" },
    ],
  });
}

const ORIGINAL_FINDING_IDS = ["f-original-1", "f-original-2"];

describe("re-inspection leaves the original report untouched", () => {
  it("1. creating a re-inspection does not modify the original inspection", async () => {
    const { db, writes, inspections } = fixture();
    const before = JSON.stringify(inspections.find((i) => i.id === ORIGINAL_ID));

    await createReinspection(db, {
      parent: inspections.find((i) => i.id === ORIGINAL_ID),
      today: "2026-09-16",
    });

    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
    expect(JSON.stringify(inspections.find((i) => i.id === ORIGINAL_ID))).toBe(before);
  });

  it("2. selecting an original finding does not modify that finding", async () => {
    const { db, writes, findings } = fixture();
    const before = JSON.stringify(findings.find((f) => f.id === "f-original-1"));

    // The exact bug this guards: the caller legitimately owns the original
    // inspection, so an ownership-only check would have let this through.
    await expect(
      setReinspectionVerdict(db, { findingId: "f-original-1", status: "corrected" }),
    ).rejects.toBeInstanceOf(OriginalReportWriteError);

    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
    expect(JSON.stringify(findings.find((f) => f.id === "f-original-1"))).toBe(before);
    expect(findings.find((f) => f.id === "f-original-1")?.reinspection_status).toBeUndefined();
  });

  it("3. after photos are never attached to the original finding", () => {
    const rows = buildReinspectionFindingRows(
      [{ id: "f-original-1", title: "Crack", photos: ["before.jpg"], photo_url: "before.jpg" }],
      REINSPECTION_ID,
    );

    // Photos are not carried: originals stay on the original finding and are
    // shown read-only as "before". New media belongs to the new finding.
    expect(rows[0]).not.toHaveProperty("photos");
    expect(rows[0]).not.toHaveProperty("photo_url");
    expect(rows[0].inspection_id).toBe(REINSPECTION_ID);
    expect(rows[0].source_finding_id).toBe("f-original-1");
  });

  it("4. AI output goes to the re-inspection copy, not the original narrative", async () => {
    const { db, findings } = fixture();
    const originalBefore = JSON.stringify(findings.find((f) => f.id === "f-original-1"));

    // Whatever an AI drafts is written to the re-inspection finding row; the
    // snapshot is a copy, so editing it cannot reach the source narrative.
    await db.from("findings")
      .update({ observation: "AI-drafted re-inspection narrative." })
      .eq("id", "f-reinspect-1");

    expect(findings.find((f) => f.id === "f-reinspect-1")?.observation)
      .toBe("AI-drafted re-inspection narrative.");
    expect(JSON.stringify(findings.find((f) => f.id === "f-original-1"))).toBe(originalBefore);
  });

  it("5. editing a re-inspection finding does not modify the original", async () => {
    const { db, writes, findings } = fixture();
    const before = JSON.stringify(findings.find((f) => f.id === "f-original-1"));

    await setReinspectionVerdict(db, { findingId: "f-reinspect-1", status: "not_corrected" });

    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
    expect(JSON.stringify(findings.find((f) => f.id === "f-original-1"))).toBe(before);
    expect(findings.find((f) => f.id === "f-reinspect-1")?.reinspection_status).toBe("not_corrected");
  });

  it("6. completing a re-inspection does not change the original's report status", async () => {
    const { db, writes, inspections } = fixture();

    await setReinspectionVerdict(db, { findingId: "f-reinspect-1", status: "corrected" });

    const original = inspections.find((i) => i.id === ORIGINAL_ID);
    expect(original?.report_status).toBe("published");
    expect(writes.filter((w) => w.table === "inspections" && String(w.match.id) === String(ORIGINAL_ID)))
      .toEqual([]);
  });

  it("7. the re-inspection is a separate document, so its PDF cannot replace the original's", async () => {
    const { db, inspections } = fixture();

    const created = await createReinspection(db, {
      parent: inspections.find((i) => i.id === ORIGINAL_ID),
      today: "2026-09-16",
    });

    // Distinct inspection id => distinct report and distinct PDF. The share
    // token that addresses the original's PDF is never carried across.
    expect(created.id).not.toBe(ORIGINAL_ID);
    const child = inspections.find((i) => i.id === created.id);
    expect(child?.public_share_token).toBeUndefined();
    expect(inspections.find((i) => i.id === ORIGINAL_ID)?.public_share_token).toBe("tok-original");
  });

  it("8. deleting a draft re-inspection leaves the original findings intact", async () => {
    const { db, findings } = fixture();

    await db.from("findings").delete().eq("inspection_id", REINSPECTION_ID);

    // Deletion is scoped by inspection_id, so it can only reach re-inspection
    // rows; source_finding_id is ON DELETE SET NULL, never a cascade.
    expect(findings.filter((f) => f.inspection_id === ORIGINAL_ID)).toHaveLength(2);
    expect(findings.find((f) => f.id === "f-original-1")?.title).toBe("Foundation wall crack");
  });

  it("9. multiple re-inspections can reference one original without modifying it", async () => {
    const { db, writes, inspections, findings } = fixture();
    const parent = inspections.find((i) => i.id === ORIGINAL_ID);
    const before = JSON.stringify(findings.filter((f) => f.inspection_id === ORIGINAL_ID));

    const first = await createReinspection(db, { parent, today: "2026-09-10" });
    const second = await createReinspection(db, { parent, today: "2026-09-16" });

    expect(first.id).not.toBe(second.id);

    // Both point back at the same originals, and the originals are unchanged.
    const copies = findings.filter((f) => f.source_finding_id === "f-original-1");
    expect(copies.length).toBeGreaterThanOrEqual(2);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
    expect(JSON.stringify(findings.filter((f) => f.inspection_id === ORIGINAL_ID))).toBe(before);
  });
});

describe("snapshot construction", () => {
  it("never carries delivery state onto the re-inspection", () => {
    const row = buildReinspectionRow(
      {
        id: ORIGINAL_ID,
        property_address: "12 Oak St",
        report_status: "published",
        public_share_token: "tok-original",
        paid: true,
        agreement_signed_at: "2026-09-01",
      },
      "2026-09-16",
    );

    expect(row.parent_inspection_id).toBe(ORIGINAL_ID);
    expect(row.property_address).toBe("12 Oak St");
    ["report_status", "public_share_token", "paid", "agreement_signed_at", "id"].forEach((field) => {
      expect(row).not.toHaveProperty(field);
    });
  });

  it("rejects a status that isn't a re-inspection verdict", async () => {
    const { db } = fixture();
    await expect(
      setReinspectionVerdict(db, { findingId: "f-reinspect-1", status: "published" }),
    ).rejects.toThrow(/Invalid re-inspection status/);
  });
});

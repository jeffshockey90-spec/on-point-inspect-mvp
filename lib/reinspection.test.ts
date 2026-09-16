import { describe, expect, it } from "vitest";
import {
  addReinspectionAfterPhoto,
  buildReinspectionFindingRows,
  buildReinspectionRow,
  createReinspection,
  deleteDraftReinspection,
  listReinspectionsOf,
  loadReinspectionItems,
  OriginalReportWriteError,
  saveReinspectionDraft,
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

function makeDb(opts: { inspections: any[]; findings: any[]; photos?: any[] }) {
  const writes: Write[] = [];
  const inspections = opts.inspections.map((row) => ({ ...row }));
  const findings = opts.findings.map((row) => ({ ...row }));
  const photos = (opts.photos || []).map((row) => ({ ...row }));
  let nextId = 900;

  // A match entry is either a scalar (eq) or { __in: [...] } (in).
  const rowMatches = (row: any, match: Record<string, any>) =>
    Object.entries(match).every(([k, v]) =>
      v && typeof v === "object" && Array.isArray((v as any).__in)
        ? (v as any).__in.map(String).includes(String(row[k]))
        : String(row[k]) === String(v));

  function table(name: string) {
    const rows = name === "inspections" ? inspections : name === "photos" ? photos : findings;
    const match: Record<string, any> = {};
    let pending: { op: string; payload: any } | null = null;

    const api: any = {
      select() { return api; },
      order() { return api; },
      eq(column: string, value: any) { match[column] = value; return api; },
      in(column: string, values: any[]) { match[column] = { __in: values }; return api; },
      insert(payload: any) { pending = { op: "insert", payload }; return api; },
      update(payload: any) { pending = { op: "update", payload }; return api; },
      delete() { pending = { op: "delete", payload: null }; return api; },

      maybeSingle() {
        const found = rows.find((row: any) => rowMatches(row, match));
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
              if (rowMatches(row, match)) Object.assign(row, pending!.payload);
            });
          }
          if (pending.op === "delete") {
            for (let i = rows.length - 1; i >= 0; i -= 1) {
              if (rowMatches(rows[i], match)) rows.splice(i, 1);
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        const matched = rows.filter((row: any) => rowMatches(row, match));
        return Promise.resolve({ data: matched.map((r: any) => ({ ...r })), error: null }).then(resolve);
      },
    };
    return api;
  }

  return { db: { from: table }, writes, inspections, findings, photos };
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
    // A delete/update scoped with .in(...) that sweeps in an original finding.
    for (const value of Object.values(w.match)) {
      if (value && typeof value === "object" && Array.isArray((value as any).__in)) {
        if ((value as any).__in.map(String).some((id: string) => originalFindingIds.map(String).includes(id))) {
          return true;
        }
      }
    }
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
    photos: [
      { id: "p-before-1", inspection_id: ORIGINAL_ID, finding_id: "f-original-1", public_url: "before-1.jpg", caption: "Original crack" },
      { id: "p-before-2", inspection_id: ORIGINAL_ID, finding_id: "f-original-2", public_url: "before-2.jpg" },
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
      findingIds: ["f-original-1"],
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

  it("3. after photos are never attached to the original finding", async () => {
    const { db, writes, photos } = fixture();

    await addReinspectionAfterPhoto(db, {
      findingId: "f-reinspect-1",
      photo: { public_url: "after-1.jpg", file_path: "after-1.jpg", caption: "Repaired" },
    });

    // The new row hangs off the RE-INSPECTION finding, and the original's
    // photos are still exactly the two it started with.
    const added = photos.find((p) => p.public_url === "after-1.jpg");
    expect(added?.finding_id).toBe("f-reinspect-1");
    expect(added?.inspection_id).toBe(REINSPECTION_ID);
    expect(photos.filter((p) => p.finding_id === "f-original-1")).toHaveLength(1);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });

  it("3b. an after photo aimed at an original finding is refused", async () => {
    const { db, writes, photos } = fixture();

    await expect(
      addReinspectionAfterPhoto(db, {
        findingId: "f-original-1",
        photo: { public_url: "sneaky.jpg" },
      }),
    ).rejects.toBeInstanceOf(OriginalReportWriteError);

    expect(photos.some((p) => p.public_url === "sneaky.jpg")).toBe(false);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });

  it("3c. the finding id on the row comes from the server, not the caller", async () => {
    const { db, photos } = fixture();

    // A caller trying to redirect the media at the original by smuggling ids in
    // the payload: both are overwritten from the verified re-inspection finding.
    await addReinspectionAfterPhoto(db, {
      findingId: "f-reinspect-1",
      photo: { public_url: "after-2.jpg", finding_id: "f-original-1", inspection_id: ORIGINAL_ID },
    });

    const added = photos.find((p) => p.public_url === "after-2.jpg");
    expect(added?.finding_id).toBe("f-reinspect-1");
    expect(added?.inspection_id).toBe(REINSPECTION_ID);
  });

  it("4. AI output goes to the re-inspection copy, not the original narrative", async () => {
    const { db, writes, findings } = fixture();
    const originalBefore = JSON.stringify(findings.find((f) => f.id === "f-original-1"));

    await saveReinspectionDraft(db, {
      findingId: "f-reinspect-1",
      fields: {
        reinspection_note: "Crack sealed and painted.",
        reinspection_summary: "AI-drafted re-inspection narrative.",
      },
    });

    expect(findings.find((f) => f.id === "f-reinspect-1")?.reinspection_summary)
      .toBe("AI-drafted re-inspection narrative.");
    expect(JSON.stringify(findings.find((f) => f.id === "f-original-1"))).toBe(originalBefore);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });

  it("4b. AI drafting aimed at an original finding is refused", async () => {
    const { db, writes, findings } = fixture();
    const before = JSON.stringify(findings.find((f) => f.id === "f-original-1"));

    await expect(
      saveReinspectionDraft(db, {
        findingId: "f-original-1",
        fields: { reinspection_summary: "Rewritten history." },
      }),
    ).rejects.toBeInstanceOf(OriginalReportWriteError);

    expect(JSON.stringify(findings.find((f) => f.id === "f-original-1"))).toBe(before);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });

  it("4c. drafting cannot reach the narrative fields at all", async () => {
    const { db, findings } = fixture();

    // Even on a legitimate re-inspection finding, only the re-inspection
    // columns are writable -- `observation` is dropped rather than applied, so
    // a mistargeted save is a no-op instead of a lost narrative.
    await saveReinspectionDraft(db, {
      findingId: "f-reinspect-1",
      fields: { reinspection_note: "note", observation: "overwritten", recommendation: "overwritten" },
    });

    const row = findings.find((f) => f.id === "f-reinspect-1");
    expect(row?.reinspection_note).toBe("note");
    expect(row?.observation).toBeUndefined();
    expect(row?.recommendation).toBeUndefined();
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
      findingIds: ["f-original-1"],
    });

    // Distinct inspection id => distinct report and distinct PDF. The share
    // token that addresses the original's PDF is never carried across.
    expect(created.id).not.toBe(ORIGINAL_ID);
    const child = inspections.find((i) => i.id === created.id);
    expect(child?.public_share_token).toBeUndefined();
    expect(inspections.find((i) => i.id === ORIGINAL_ID)?.public_share_token).toBe("tok-original");
  });

  it("8. deleting a draft re-inspection leaves the original findings and photos intact", async () => {
    const { db, writes, findings, photos, inspections } = fixture();

    await deleteDraftReinspection(db, REINSPECTION_ID);

    // The re-inspection and its rows are gone; the original keeps both findings
    // and both photos. source_finding_id is ON DELETE SET NULL, never a cascade.
    expect(inspections.some((i) => i.id === REINSPECTION_ID)).toBe(false);
    expect(findings.filter((f) => f.inspection_id === ORIGINAL_ID)).toHaveLength(2);
    expect(findings.find((f) => f.id === "f-original-1")?.title).toBe("Foundation wall crack");
    expect(photos.filter((p) => p.inspection_id === ORIGINAL_ID)).toHaveLength(2);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });

  it("8b. deleting an ORIGINAL through the re-inspection path is refused", async () => {
    const { db, writes, findings, inspections } = fixture();

    await expect(deleteDraftReinspection(db, ORIGINAL_ID))
      .rejects.toBeInstanceOf(OriginalReportWriteError);

    expect(inspections.some((i) => i.id === ORIGINAL_ID)).toBe(true);
    expect(findings.filter((f) => f.inspection_id === ORIGINAL_ID)).toHaveLength(2);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });

  it("9. multiple re-inspections can reference one original without modifying it", async () => {
    const { db, writes, inspections, findings } = fixture();
    const parent = inspections.find((i) => i.id === ORIGINAL_ID);
    const before = JSON.stringify(findings.filter((f) => f.inspection_id === ORIGINAL_ID));

    const first = await createReinspection(db, { parent, today: "2026-09-10", findingIds: ["f-original-1"] });
    const second = await createReinspection(db, { parent, today: "2026-09-16", findingIds: ["f-original-1"] });

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

describe("reading the original for before/after display", () => {
  it("pairs each re-inspection item with its original and the original's photos", async () => {
    const { db, writes } = fixture();

    const loaded = await loadReinspectionItems(db, REINSPECTION_ID);
    const item = loaded.items[0];

    expect(item.original?.observation).toBe("Original narrative.");
    expect(item.beforePhotos.map((p: any) => p.public_url)).toEqual(["before-1.jpg"]);
    expect(item.afterPhotos).toEqual([]);

    // The whole point: reading the original for display writes nothing at all.
    expect(writes).toEqual([]);
  });

  it("shows after photos on the re-inspection side only", async () => {
    const { db } = fixture();

    await addReinspectionAfterPhoto(db, {
      findingId: "f-reinspect-1",
      photo: { public_url: "after-1.jpg" },
    });

    const { items } = await loadReinspectionItems(db, REINSPECTION_ID);
    expect(items[0].beforePhotos.map((p: any) => p.public_url)).toEqual(["before-1.jpg"]);
    expect(items[0].afterPhotos.map((p: any) => p.public_url)).toEqual(["after-1.jpg"]);
  });

  it("refuses to read an original as if it were a re-inspection", async () => {
    const { db } = fixture();
    await expect(loadReinspectionItems(db, ORIGINAL_ID))
      .rejects.toBeInstanceOf(OriginalReportWriteError);
  });

  it("lists every re-inspection of one original in order, original untouched", async () => {
    const { db, writes, inspections, findings } = fixture();
    const parent = inspections.find((i) => i.id === ORIGINAL_ID);
    const before = JSON.stringify(findings.filter((f) => f.inspection_id === ORIGINAL_ID));

    const first = await createReinspection(db, { parent, today: "2026-09-10", findingIds: ["f-original-1"] });
    await setReinspectionVerdict(db, {
      findingId: findings.find((f) => f.inspection_id === first.id)?.id,
      status: "not_corrected",
    });
    const second = await createReinspection(db, { parent, today: "2026-09-16", findingIds: ["f-original-1"] });
    await setReinspectionVerdict(db, {
      findingId: findings.find((f) => f.inspection_id === second.id)?.id,
      status: "corrected",
    });

    const history = await listReinspectionsOf(db, ORIGINAL_ID);
    expect(history.map((r: any) => r.id)).toEqual(
      expect.arrayContaining([REINSPECTION_ID, first.id, second.id]),
    );

    // Sept 10 says not corrected, Sept 16 says corrected, and the Sept 1
    // original is byte-identical through both.
    expect(findings.find((f) => f.inspection_id === first.id)?.reinspection_status).toBe("not_corrected");
    expect(findings.find((f) => f.inspection_id === second.id)?.reinspection_status).toBe("corrected");
    expect(JSON.stringify(findings.filter((f) => f.inspection_id === ORIGINAL_ID))).toBe(before);
    expect(writesTouchingOriginal(writes, ORIGINAL_FINDING_IDS)).toEqual([]);
  });
});

describe("a re-inspection covers only what was re-checked", () => {
  it("carries just the selected findings, not the whole report", async () => {
    const { db, inspections, findings } = fixture();

    const created = await createReinspection(db, {
      parent: inspections.find((i) => i.id === ORIGINAL_ID),
      today: "2026-09-16",
      findingIds: ["f-original-2"],
    });

    // The original has two findings; only the requested one comes across, so
    // the document never lists an item that was not looked at on the visit.
    const carried = findings.filter((f) => f.inspection_id === created.id);
    expect(carried).toHaveLength(1);
    expect(carried[0].source_finding_id).toBe("f-original-2");
    expect(created.carriedFindings).toBe(1);
  });

  it("refuses to create one with nothing selected", async () => {
    const { db, writes, inspections } = fixture();

    await expect(
      createReinspection(db, {
        parent: inspections.find((i) => i.id === ORIGINAL_ID),
        today: "2026-09-16",
        findingIds: [],
      }),
    ).rejects.toThrow(/Select at least one finding/);

    // Nothing was created, so a cancelled picker leaves no stray report.
    expect(writes).toEqual([]);
  });

  it("ignores a finding id that belongs to another inspection", async () => {
    const { db, inspections, findings } = fixture();

    // "f-reinspect-1" is real but belongs to a different inspection. Pulling it
    // in would put another report's finding into this client's document.
    const created = await createReinspection(db, {
      parent: inspections.find((i) => i.id === ORIGINAL_ID),
      today: "2026-09-16",
      findingIds: ["f-original-1", "f-reinspect-1"],
    });

    const carried = findings.filter((f) => f.inspection_id === created.id);
    expect(carried.map((f) => f.source_finding_id)).toEqual(["f-original-1"]);
  });

  it("creates nothing when no selected id belongs to the report", async () => {
    const { db, writes, inspections } = fixture();

    await expect(
      createReinspection(db, {
        parent: inspections.find((i) => i.id === ORIGINAL_ID),
        today: "2026-09-16",
        findingIds: ["f-reinspect-1"],
      }),
    ).rejects.toThrow(/belong to this report/);

    expect(writes).toEqual([]);
  });
});

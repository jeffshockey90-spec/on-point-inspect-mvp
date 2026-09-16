/**
 * Limited Repair Re-Inspection — the only path allowed to write.
 *
 * The original inspection report is historical documentation. Once it exists,
 * the re-inspection workflow may READ it freely and must never write to it:
 * not the inspection row, not its findings, not its photos, not its status,
 * PDF, agreements or repair requests.
 *
 * A re-inspection is a separate child inspection (parent_inspection_id -> the
 * original) carrying an immutable SNAPSHOT of the original findings. Copies,
 * not references, so re-evaluating an item can never reach back to the source
 * row — and so the original narrative stays frozen even if the inspector edits
 * the re-inspection's wording.
 *
 * Every mutation lives in this module and asserts its target belongs to a
 * re-inspection before touching it. The route layer is a thin wrapper, so the
 * guarantee is enforced in one place and can be proved by tests
 * (lib/reinspection.test.ts) rather than trusted to the UI. A matching database
 * trigger in supabase/reinspection-immutability.sql is the backstop for anything
 * that bypasses this module entirely.
 */

/** Thrown when an operation would have written to the original report. */
export class OriginalReportWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginalReportWriteError";
  }
}

export const REINSPECTION_STATUSES = ["corrected", "not_corrected", "not_evaluated"] as const;
export type ReinspectionStatus = (typeof REINSPECTION_STATUSES)[number];

export function isReinspectionStatus(value: any): value is ReinspectionStatus {
  return REINSPECTION_STATUSES.includes(value);
}

/**
 * Inspection fields copied onto the re-inspection.
 *
 * Property and contact details only. Status, share tokens, payment, agreement,
 * signature, publication and PDF state are deliberately absent: the
 * re-inspection starts fresh on all of those and must never inherit — or later
 * write back — the original's delivery state.
 */
export const CARRY_INSPECTION_FIELDS = [
  "client", "realtor", "address", "sqft", "city", "state", "zip", "year_built",
  "property_type", "property_style", "property_image_url", "property_image",
  "property_photo_url", "property_address", "square_feet", "client_name",
  "client_email", "client_phone", "client_organization_name", "realtor_name",
  "realtor_email", "realtor_phone", "realtor_id", "realtor_contact_id",
  "agent_name", "agent_email", "agent_phone", "inspection_time", "services",
  "service_mode", "service_type", "service_fees", "company_id", "inspector_id",
  "property_latitude", "property_longitude",
];

/**
 * Finding fields snapshotted onto the re-inspection.
 *
 * Narrative, severity and section are copied so the re-inspection shows what
 * was originally written even if the original is later corrected — and so the
 * inspector can reword the re-inspection without touching history. Photos are
 * NOT copied: originals stay attached to the original finding and are displayed
 * read-only as the "before" image, while re-inspection photos are new media
 * rows on the new finding.
 */
export const CARRY_FINDING_FIELDS = [
  "section", "title", "observation", "implication", "recommendation", "severity",
  "category", "tag", "comment", "description", "location", "company_id",
];

export function pick(row: any, keys: string[]) {
  const out: Record<string, any> = {};
  for (const key of keys) if (row?.[key] !== undefined) out[key] = row[key];
  return out;
}

/** Build the child inspection row. Pure, so tests can assert what is carried. */
export function buildReinspectionRow(parent: any, today: string): Record<string, any> {
  return {
    ...pick(parent, CARRY_INSPECTION_FIELDS),
    parent_inspection_id: parent.id,
    inspection_date: today,
  };
}

/**
 * Build the snapshot finding rows.
 *
 * source_finding_id records which original each copy came from, so one original
 * finding can be re-inspected repeatedly and the history reads back in order.
 * It is a reference only — nothing ever writes through it.
 */
export function buildReinspectionFindingRows(
  parentFindings: any[],
  reinspectionId: any,
): Record<string, any>[] {
  return (parentFindings || []).map((finding: any) => ({
    ...pick(finding, CARRY_FINDING_FIELDS),
    inspection_id: reinspectionId,
    source_finding_id: finding.id,
    reinspection_status: "not_evaluated",
  }));
}

/**
 * Confirm an inspection is a re-inspection before anything writes to it.
 * Throws rather than returning false — a caller that forgets to check the
 * result should fail loudly, not silently write to the original.
 */
export async function assertIsReinspection(db: any, inspectionId: any) {
  const { data } = await db
    .from("inspections")
    .select("id, parent_inspection_id")
    .eq("id", inspectionId)
    .maybeSingle();

  if (!data?.id) {
    throw new OriginalReportWriteError(`Inspection ${inspectionId} not found.`);
  }
  if (!data.parent_inspection_id) {
    throw new OriginalReportWriteError(
      `Inspection ${inspectionId} is an original report and is read-only to the re-inspection workflow.`,
    );
  }
  return data;
}

/**
 * Record a verdict against ONE re-inspection finding.
 *
 * The guard that matters: a finding id belonging to the original report is
 * rejected even though the caller legitimately owns that inspection. Ownership
 * is not permission to rewrite history, and the UI only ever offering
 * re-inspection findings is not something the API may assume.
 */
export async function setReinspectionVerdict(
  db: any,
  opts: { findingId: any; status: string },
) {
  if (!isReinspectionStatus(opts.status)) {
    throw new Error(`Invalid re-inspection status: ${opts.status}`);
  }

  const { data: finding } = await db
    .from("findings")
    .select("id, inspection_id")
    .eq("id", opts.findingId)
    .maybeSingle();

  if (!finding?.id) {
    throw new OriginalReportWriteError(`Finding ${opts.findingId} not found.`);
  }

  // Throws when the finding belongs to an original report.
  await assertIsReinspection(db, finding.inspection_id);

  const { error } = await db
    .from("findings")
    .update({ reinspection_status: opts.status })
    .eq("id", opts.findingId);

  if (error) throw new Error(error.message);

  return { id: finding.id, inspection_id: finding.inspection_id, status: opts.status };
}

/**
 * Create a re-inspection from an original.
 *
 * Reads the parent and its findings; writes only the new child inspection and
 * the new snapshot findings. Nothing in here updates the parent — creating a
 * re-inspection leaves the original byte-identical, including its status, so an
 * original can be re-inspected any number of times.
 */
export async function createReinspection(
  db: any,
  opts: { parent: any; today: string },
) {
  const { parent, today } = opts;

  const { data: created, error: createError } = await db
    .from("inspections")
    .insert(buildReinspectionRow(parent, today))
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message || "Could not create re-inspection.");
  }

  const { data: parentFindings } = await db
    .from("findings")
    .select("*")
    .eq("inspection_id", parent.id)
    .order("id", { ascending: true });

  const rows = buildReinspectionFindingRows(parentFindings || [], created.id);
  if (rows.length) {
    const { error: insertError } = await db.from("findings").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  return { id: created.id, carriedFindings: rows.length };
}

/**
 * Re-inspection narrative fields the inspector (or AI) may write.
 *
 * Deliberately narrow. These columns exist only on re-inspection findings, so
 * even a mistargeted write cannot overwrite an original's observation,
 * implication or recommendation — the original narrative has no field in this
 * list. AI drafting goes through here, which is what keeps "AI may never update
 * the original finding" true by construction rather than by prompt.
 */
export const REINSPECTION_DRAFT_FIELDS = [
  "reinspection_note",
  "reinspection_summary",
] as const;

/**
 * Save inspector notes / AI-drafted text against ONE re-inspection finding.
 *
 * Unknown keys are dropped rather than passed through: a caller that sends
 * `observation` is trying, knowingly or not, to rewrite the narrative, and the
 * whitelist means the worst case is a no-op instead of a lost original.
 */
export async function saveReinspectionDraft(
  db: any,
  opts: { findingId: any; fields: Record<string, any> },
) {
  const updates: Record<string, any> = {};
  for (const key of REINSPECTION_DRAFT_FIELDS) {
    if (opts.fields?.[key] !== undefined) updates[key] = opts.fields[key];
  }
  if (!Object.keys(updates).length) {
    throw new Error("No re-inspection draft fields to save.");
  }

  const { data: finding } = await db
    .from("findings")
    .select("id, inspection_id")
    .eq("id", opts.findingId)
    .maybeSingle();

  if (!finding?.id) {
    throw new OriginalReportWriteError(`Finding ${opts.findingId} not found.`);
  }

  await assertIsReinspection(db, finding.inspection_id);

  const { error } = await db.from("findings").update(updates).eq("id", opts.findingId);
  if (error) throw new Error(error.message);

  return { id: finding.id, fields: Object.keys(updates) };
}

/**
 * Attach an AFTER photo to a re-inspection finding.
 *
 * finding_id and inspection_id are taken from the re-inspection finding we just
 * verified, never from the caller — otherwise a client could post the original
 * finding's id and hang new media off the historical report. The BEFORE photos
 * are the original finding's existing rows and are never copied, moved or
 * re-pointed; they stay exactly where they are and are read for display only.
 */
export async function addReinspectionAfterPhoto(
  db: any,
  opts: { findingId: any; photo: Record<string, any> },
) {
  const { data: finding } = await db
    .from("findings")
    .select("id, inspection_id")
    .eq("id", opts.findingId)
    .maybeSingle();

  if (!finding?.id) {
    throw new OriginalReportWriteError(`Finding ${opts.findingId} not found.`);
  }

  await assertIsReinspection(db, finding.inspection_id);

  const row = {
    ...pick(opts.photo, [
      "public_url", "file_path", "thumbnail_url", "thumbnail_path",
      "is_video", "mime_type", "caption", "sort_order",
    ]),
    finding_id: finding.id,
    inspection_id: finding.inspection_id,
  };

  const { data, error } = await db.from("photos").insert(row).select("id").single();
  if (error) throw new Error(error.message);

  return { id: data?.id, finding_id: finding.id, inspection_id: finding.inspection_id };
}

/**
 * Read one re-inspection as before/after pairs. READ ONLY — no write anywhere.
 *
 * BEFORE is the original finding and its existing photos, fetched through
 * source_finding_id and handed back untouched. AFTER is the re-inspection
 * finding and the photos attached to it. The two never mix: original photo rows
 * keep pointing at the original finding, so displaying a "before" image is a
 * read of history, not a copy of it.
 */
export async function loadReinspectionItems(db: any, reinspectionId: any) {
  const inspection = await assertIsReinspectionReadable(db, reinspectionId);

  const { data: items } = await db
    .from("findings")
    .select("*")
    .eq("inspection_id", reinspectionId)
    .order("id", { ascending: true });

  const rows = items || [];
  const sourceIds = rows.map((r: any) => r.source_finding_id).filter(Boolean);
  const findingIds = rows.map((r: any) => r.id);

  const [originals, beforePhotos, afterPhotos] = await Promise.all([
    sourceIds.length
      ? db.from("findings").select("*").in("id", sourceIds)
      : Promise.resolve({ data: [] }),
    sourceIds.length
      ? db.from("photos").select("*").in("finding_id", sourceIds)
      : Promise.resolve({ data: [] }),
    findingIds.length
      ? db.from("photos").select("*").in("finding_id", findingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const byId = new Map((originals.data || []).map((f: any) => [String(f.id), f]));
  const group = (photos: any[]) => {
    const out = new Map<string, any[]>();
    for (const p of photos || []) {
      const key = String(p.finding_id);
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(p);
    }
    return out;
  };
  const before = group(beforePhotos.data || []);
  const after = group(afterPhotos.data || []);

  return {
    inspection,
    items: rows.map((row: any) => ({
      finding: row,
      original: row.source_finding_id ? byId.get(String(row.source_finding_id)) || null : null,
      beforePhotos: row.source_finding_id ? before.get(String(row.source_finding_id)) || [] : [],
      afterPhotos: after.get(String(row.id)) || [],
    })),
  };
}

/** assertIsReinspection's read-side twin: same check, name says no write follows. */
async function assertIsReinspectionReadable(db: any, inspectionId: any) {
  return assertIsReinspection(db, inspectionId);
}

/**
 * Delete a draft re-inspection and only what belongs to it.
 *
 * Scoped by inspection_id on the re-inspection itself, so the delete cannot
 * reach an original finding or an original photo even if source_finding_id
 * points at one. The AFTER photos go, the BEFORE photos stay — they were never
 * this inspection's rows to begin with.
 */
export async function deleteDraftReinspection(db: any, inspectionId: any) {
  await assertIsReinspection(db, inspectionId);

  const { data: findings } = await db
    .from("findings")
    .select("id")
    .eq("inspection_id", inspectionId);

  const ids = (findings || []).map((f: any) => f.id);
  if (ids.length) {
    const { error: photoError } = await db
      .from("photos")
      .delete()
      .eq("inspection_id", inspectionId)
      .in("finding_id", ids);
    if (photoError) throw new Error(photoError.message);
  }

  const { error: findingError } = await db
    .from("findings")
    .delete()
    .eq("inspection_id", inspectionId);
  if (findingError) throw new Error(findingError.message);

  const { error: inspectionError } = await db
    .from("inspections")
    .delete()
    .eq("id", inspectionId);
  if (inspectionError) throw new Error(inspectionError.message);

  return { id: inspectionId, deletedFindings: ids.length };
}

/**
 * Every re-inspection of one original, newest first, with its verdict per item.
 *
 * Pure read. Powers the client portal listing the original and each
 * re-inspection as separate documents, and the "multiple re-inspections over
 * time" history — Sept 10 not corrected, Sept 16 corrected, the Sept 1 original
 * unchanged throughout.
 */
export async function listReinspectionsOf(db: any, originalId: any) {
  const { data } = await db
    .from("inspections")
    .select("id, inspection_date, created_at, status, parent_inspection_id")
    .eq("parent_inspection_id", originalId)
    .order("id", { ascending: true });

  return data || [];
}

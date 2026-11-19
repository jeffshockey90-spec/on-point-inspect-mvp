// When an inspector switches a job to a DIFFERENT agreement, the old signature
// can't count for the new document. The earlier signed record is kept for the
// audit trail but marked "superseded" (signed-agreement lists only show
// status="signed"), and every client/co-client goes back to unsigned so the
// builder, the delivery gate and the client's agreement page all ask for the
// new agreement to be signed.

/** Did the agreement selection actually change (ignoring order / duplicates)? */
export function templateSelectionChanged(
  previous: Array<string | number | null | undefined> | null | undefined,
  next: Array<string | number | null | undefined> | null | undefined,
): boolean {
  const norm = (ids: Array<string | number | null | undefined> | null | undefined) =>
    Array.from(new Set((ids || []).map((id) => String(id ?? "").trim()).filter(Boolean))).sort();
  const a = norm(previous);
  const b = norm(next);
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/** The job's current agreement ids (multi-select column, else the single one). */
export function currentTemplateIds(inspection: Record<string, any> | null | undefined): string[] {
  const many = Array.isArray(inspection?.agreement_template_ids) ? inspection!.agreement_template_ids : [];
  if (many.length) return many.map((id: any) => String(id));
  return inspection?.agreement_template_id ? [String(inspection.agreement_template_id)] : [];
}

type Db = { from: (table: string) => any };

/**
 * Retire existing signatures on a job (after its agreement changed). Returns
 * true when something had been signed. Best-effort per table so one missing
 * column never blocks the agreement change itself.
 */
export async function resetAgreementSignatures(db: Db, inspectionId: string | number): Promise<boolean> {
  const id = String(inspectionId);
  let hadSignature = false;

  try {
    const { data } = await db.from("inspection_agreements").select("id").eq("inspection_id", id).eq("status", "signed");
    if ((data || []).length) {
      hadSignature = true;
      await db.from("inspection_agreements").update({ status: "superseded" }).eq("inspection_id", id).eq("status", "signed");
    }
  } catch (error) {
    console.warn("resetAgreementSignatures: inspection_agreements", error);
  }

  try {
    const { data } = await db
      .from("inspection_contacts")
      .select("id")
      .eq("inspection_id", id)
      .eq("agreement_signed", true);
    if ((data || []).length) {
      hadSignature = true;
      await db
        .from("inspection_contacts")
        .update({ agreement_signed: false, signed_at: null })
        .eq("inspection_id", id)
        .eq("agreement_signed", true);
    }
  } catch (error) {
    console.warn("resetAgreementSignatures: inspection_contacts", error);
  }

  try {
    await db.from("inspections").update({ agreement_status: "pending" }).eq("id", id);
  } catch (error) {
    console.warn("resetAgreementSignatures: inspections", error);
  }

  return hadSignature;
}

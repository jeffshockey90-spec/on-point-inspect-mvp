// Rows for inserting findings. `findings` has NO inspector_id column (CLAUDE.md):
// an inspector_id key 400s the whole insert. This strips it defensively so a
// caller (or a spread default) can never reintroduce that bug.
export function findingInsertRows<T extends Record<string, any>>(
  inspectionId: string | number,
  companyId: string | number | null | undefined,
  findings: T[],
): Array<Omit<T, "inspector_id"> & { inspection_id: string | number; company_id: string | number | null }> {
  return (findings || []).map((finding) => {
    const { inspector_id: _drop, ...rest } = finding as any;
    return { ...rest, inspection_id: inspectionId, company_id: companyId ?? null };
  });
}

// What a section-checklist row actually displays on the client report.
//
// A custom-text row — either the "__TEXT_VALUE__" sentinel or an "OTHER"
// selection (any case) — shows its custom_text; everything else shows its
// value. A blank result means the row is dropped from the report entirely
// (empty rows, and therefore empty groups/sections, never render).
//
// This was duplicated verbatim in the share page and the print page, and
// inlined a third time in the realtor PDF route (where a case-sensitive "OTHER"
// check had previously let a lowercase value print the literal token). One
// source keeps all three client-facing surfaces in agreement.

export function checklistRowDisplay(row: any): string {
  const value = String(row?.value ?? "");
  if (value === "__TEXT_VALUE__" || value.toUpperCase() === "OTHER") {
    return String(row?.custom_text ?? "").trim();
  }
  return value.trim();
}

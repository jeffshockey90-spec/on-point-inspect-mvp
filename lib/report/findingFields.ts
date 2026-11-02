// Shared finding field-resolution helpers for the report surfaces.
//
// A finding's display title and its item-group label are each resolved from a
// fallback chain of possible columns. The share page and the print page carried
// byte-identical copies; centralize them so the two surfaces (and the item
// numbering built on top of them) can never resolve a finding differently.

export function getRepairNumberTitle(finding: any) {
  const rawTitle = String(
    finding?.title ||
      finding?.finding_title ||
      finding?.defect_title ||
      finding?.name ||
      "Untitled Finding"
  ).trim();

  // Strip a leading "1.2.3 - " style numeric prefix so our own item numbering
  // does not collide with a number baked into an imported title.
  return rawTitle.replace(/^\d+\.\d+\.\d+\s*[-–—:]\s*/g, "");
}

export function getRepairItemGroupLabel(finding: any) {
  return (
    String(
      finding?.component ||
        finding?.subsection ||
        finding?.category ||
        finding?.system ||
        finding?.group_title ||
        finding?.item_group ||
        "General"
    ).trim() || "General"
  );
}

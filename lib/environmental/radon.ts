// Shared radon classification + client-facing summary wording.
// Extracted from app/environmental-report/[id]/page.tsx and
// app/environmental-share/[id]/page.tsx, which carried identical copies.
// Single source for the EPA action-level thresholds (2.0 / 4.0 pCi/L) and the
// cautious client wording — keep the two in sync here, not per surface.

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

export function classifyRadon(average: any) {
  const value = getNumber(average);

  if (!value) return "Pending";
  if (value >= 4) return "Action Recommended";
  if (value >= 2) return "Monitor";

  return "Low";
}

export function radonSummary(average: any) {
  const value = getNumber(average);

  if (!value) return "Radon test results have not been entered yet.";

  if (value >= 4) {
    return `The average radon concentration measured during the testing period was ${value} pCi/L. This is at or above the EPA action level of 4.0 pCi/L. Mitigation by a qualified radon contractor is recommended.`;
  }

  if (value >= 2) {
    return `The average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L but above 2.0 pCi/L. Continued monitoring or consultation may be considered.`;
  }

  return `The average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L.`;
}

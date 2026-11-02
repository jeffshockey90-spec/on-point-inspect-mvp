// Canonical severity bucketing shared by every report surface.
//
// A finding's free-text severity (e.g. "Safety Concern", "Recommended Repair",
// "Minor Defect", a per-company custom label) is collapsed into one of four
// buckets. The client share report is the authoritative client-facing view and
// already drives the defect counts, so its precedence is the canonical one:
//
//   safety / hazard / major  ->  "safety"
//   repair / defect          ->  "repair"
//   maintenance / monitor / minor  ->  "maintenance"
//   information / info / client    ->  "information"
//   (anything else)          ->  "repair"
//
// Only this bucket LOGIC is shared. Each surface keeps its own bucket->color /
// bucket->label MAPPING (print uses solid paper colors, share uses theme tokens,
// the realtor PDF uses hex from severityConfig and human-readable labels).
//
// The precedence matters where a label contains more than one keyword: e.g.
// "Minor Defect" matches both the repair family ("defect") and the maintenance
// family ("minor"); the repair branch runs first, so it buckets as "repair".

export type SeverityBucket = "safety" | "repair" | "maintenance" | "information";

export function severityBucket(severityValue: unknown): SeverityBucket {
  const severity = String(severityValue || "Recommended Repair").toLowerCase();

  if (
    severity.includes("safety") ||
    severity.includes("hazard") ||
    severity.includes("major")
  ) {
    return "safety";
  }

  if (severity.includes("repair") || severity.includes("defect")) {
    return "repair";
  }

  if (
    severity.includes("maintenance") ||
    severity.includes("monitor") ||
    severity.includes("minor")
  ) {
    return "maintenance";
  }

  if (
    severity.includes("information") ||
    severity.includes("info") ||
    severity.includes("client")
  ) {
    return "information";
  }

  return "repair";
}

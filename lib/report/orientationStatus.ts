// Home Orientation (new-owner walkthrough) jobs never get a published report,
// so report-pipeline labels like "Draft" don't apply to them. Their status is
// driven by the walkthrough date instead: done once the date has arrived,
// scheduled before that, unknown with no usable date.

export type OrientationStatus = "completed" | "scheduled" | "unknown";

/** `inspectionDate` and `todayKey` are YYYY-MM-DD (anything longer is trimmed). */
export function orientationStatus(
  inspectionDate: string | null | undefined,
  todayKey: string,
): OrientationStatus {
  const date = String(inspectionDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return "unknown";
  return date <= todayKey ? "completed" : "scheduled";
}

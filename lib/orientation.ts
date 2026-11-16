// Home Orientation (new-owner walkthrough) jobs are real, paid jobs but never
// produce a report. One shared check so "report" emails, reminders and labels
// can't be sent for them. A job counts as a walkthrough when it was flagged at
// creation (is_orientation) or its service mode is the orientation service.
import { ORIENTATION_SERVICE_KEY } from "./inspectorPricing";
import { canonicalServiceKey } from "./agreementTemplates";

export function isOrientationJob(row: { is_orientation?: unknown; service_mode?: unknown } | null | undefined): boolean {
  if (!row) return false;
  if (row.is_orientation === true) return true;
  const mode = String(row.service_mode || "").trim();
  return Boolean(mode) && canonicalServiceKey(mode) === ORIENTATION_SERVICE_KEY;
}

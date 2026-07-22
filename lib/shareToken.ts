import { randomUUID } from "crypto";

/** Reads whichever share-token column is populated on an inspection row. */
export function getInspectionShareToken(inspection: any): string {
  return String(
    inspection?.public_share_token ||
      inspection?.share_token ||
      inspection?.report_share_token ||
      ""
  ).trim();
}

/**
 * Returns the inspection's existing share token, or generates and persists
 * a new one if it doesn't have one yet. Used so public report/portal links
 * are unguessable instead of a raw sequential inspection id.
 */
export async function getOrCreateShareToken(
  admin: { from: (table: string) => any },
  inspection: any
): Promise<string> {
  const existing = getInspectionShareToken(inspection);
  if (existing) return existing;

  const token = randomUUID().replace(/-/g, "");

  const { error } = await admin
    .from("inspections")
    .update({ public_share_token: token })
    .eq("id", inspection.id);

  if (error) {
    console.error("Share token create error:", error);
    return String(inspection.id);
  }

  return token;
}

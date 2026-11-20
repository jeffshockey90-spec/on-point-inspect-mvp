// Signs email click/open tracking links so the public /api/email-click and
// /api/email-open routes only record events for links FLOW actually sent.
// Without this, anyone could loop over inspection ids and fill every tenant's
// "Who viewed" panel with fake clicks/opens (and mark emails as clicked).
//
// The signature covers the inspection id and recipient email. Links in emails
// sent before signing existed still redirect normally; they just aren't
// recorded.

import { signInternal, verifyInternal } from "./internalSignature";

const PURPOSE = "email-track";
// Email links stay clickable for a long time (clients revisit old reports).
const TTL_SECONDS = 60 * 60 * 24 * 400;

function subject(inspectionId: string, recipientEmail: string) {
  return `${String(inspectionId).trim()}|${String(recipientEmail || "").trim().toLowerCase()}`;
}

/** Adds t_exp/t_sig to a tracking URL that carries inspection_id (+ recipient_email). */
export function signTrackingUrl(url: string, now = Date.now()): string {
  try {
    const parsed = new URL(url);
    const inspectionId = parsed.searchParams.get("inspection_id") || "";
    if (!inspectionId) return url;
    const recipient = parsed.searchParams.get("recipient_email") || "";
    const { exp, sig } = signInternal(PURPOSE, subject(inspectionId, recipient), TTL_SECONDS, now);
    if (!sig) return url;
    parsed.searchParams.set("t_exp", String(exp));
    parsed.searchParams.set("t_sig", sig);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** True only for a tracking request whose params match a link FLOW signed. */
export function verifyTrackingParams(params: URLSearchParams, now = Date.now()): boolean {
  const inspectionId = params.get("inspection_id") || "";
  if (!inspectionId) return false;
  const recipient = params.get("recipient_email") || params.get("recipientEmail") || "";
  return verifyInternal(PURPOSE, subject(inspectionId, recipient), params.get("t_exp"), params.get("t_sig"), now);
}

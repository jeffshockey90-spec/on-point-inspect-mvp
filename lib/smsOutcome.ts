// Builds the "what happened with texting" fragment shown after an agreement
// send/reminder, so Jeff can tell whether a text actually went out instead of
// it failing silently (no phone on file, or the carrier rejected it).

export type SmsOutcomeCounts = {
  sent: number;
  skippedNoPhone: number;
  failed: number;
};

export function describeSmsOutcome(counts: SmsOutcomeCounts): string | null {
  const sent = counts?.sent || 0;
  const skippedNoPhone = counts?.skippedNoPhone || 0;
  const failed = counts?.failed || 0;

  const parts: string[] = [];

  if (sent > 0) parts.push(`and ${sent} text${sent === 1 ? "" : "s"}`);
  if (skippedNoPhone > 0) {
    parts.push(
      `no text sent to ${skippedNoPhone} recipient${skippedNoPhone === 1 ? "" : "s"} (no phone on file)`
    );
  }
  if (failed > 0) {
    parts.push(`text failed for ${failed} recipient${failed === 1 ? "" : "s"}`);
  }

  return parts.length ? parts.join("; ") : null;
}

// Picks the most recent "sent" timestamp per inspection_contacts.id out of a
// list of email_logs rows (agreement_email / agreement_reminder sends each
// stamp metadata.contactId with the recipient contact's id).
export function pickLatestSentAtByContact(
  logs: Array<{
    sent_at?: string | null;
    metadata?: { contactId?: string | number | null } | null;
  }> | null
  | undefined,
): Record<string, string> {
  const sorted = [...(logs || [])].sort((a, b) => {
    const aTime = a?.sent_at ? new Date(a.sent_at).getTime() : 0;
    const bTime = b?.sent_at ? new Date(b.sent_at).getTime() : 0;
    return bTime - aTime;
  });

  const result: Record<string, string> = {};

  for (const log of sorted) {
    const contactId = String(log?.metadata?.contactId ?? "").trim();
    if (!contactId || !log?.sent_at) continue;
    if (!result[contactId]) result[contactId] = log.sent_at;
  }

  return result;
}

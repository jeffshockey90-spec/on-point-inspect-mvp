export type AgreementRecord = {
  id?: string | number | null;
  contact_id?: string | number | null;
  client_email?: string | null;
  signed_at?: string | null;
  status?: string | null;
};

// Re-signing (e.g. a client signs, then an add-on is added and they re-sign to
// cover the combined scope) marks the prior signed record "superseded" rather
// than deleting it, so the report can show one current signature per contact
// but still surface what it replaced. Picks the most recent superseded record
// for a contact, matched by contact id first and falling back to email.
export function findReplacedAgreementForContact(
  agreements: AgreementRecord[] | null | undefined,
  contact: { id?: string | number | null; email?: string | null } | null | undefined,
): AgreementRecord | null {
  const superseded = (agreements || []).filter((a) => a?.status === "superseded");

  const sorted = [...superseded].sort((a, b) => {
    const aTime = a?.signed_at ? new Date(a.signed_at).getTime() : 0;
    const bTime = b?.signed_at ? new Date(b.signed_at).getTime() : 0;
    return bTime - aTime;
  });

  const contactId = String(contact?.id ?? "").trim();
  if (contactId) {
    const byContact = sorted.find((a) => String(a?.contact_id ?? "") === contactId);
    if (byContact) return byContact;
  }

  const email = String(contact?.email ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = sorted.find(
      (a) => String(a?.client_email ?? "").trim().toLowerCase() === email,
    );
    if (byEmail) return byEmail;
  }

  return null;
}

// Shared payment/agreement/publish status logic for inspections, used by
// the dashboard and the Reports list so both pages agree on what counts as
// paid, signed, and published.

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

export function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    0
  );
}

export function getBalanceDue(inspection: any) {
  const storedBalance = inspection?.balance_due;

  if (storedBalance !== null && storedBalance !== undefined) {
    return Math.max(0, getNumber(storedBalance));
  }

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getNumber(inspection?.amount_paid);

  return Math.max(0, invoiceAmount - amountPaid);
}

export function isPaymentComplete(inspection: any) {
  const hasPaymentFields =
    inspection &&
    ("payment_status" in inspection ||
      "invoice_status" in inspection ||
      "invoice_amount" in inspection ||
      "amount_paid" in inspection ||
      "balance_due" in inspection ||
      "total_price" in inspection);

  if (!hasPaymentFields) return true;

  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getNumber(inspection?.amount_paid);
  const balanceDue = getBalanceDue(inspection);

  if (status === "paid" || status === "waived") return true;
  if (status === "unpaid" || status === "partial") return false;
  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;
  if (invoiceAmount > 0 && balanceDue <= 0) return true;
  if (invoiceAmount > 0) return false;

  // No invoice amount set at all and status doesn't say paid/waived - only
  // treat it as complete when there's truly no payment status on record
  // (e.g. payment tracking unused for this inspection), not for an
  // unrecognized/pending status.
  return status === "";
}

export function isPublished(inspection: any) {
  return (
    inspection?.published === true ||
    String(inspection?.report_status || "").toLowerCase() === "published"
  );
}

export function getSignedAgreementKey(agreement: any) {
  return (
    String(agreement?.contact_id || "").trim() ||
    String(agreement?.client_email || "").trim().toLowerCase()
  );
}

export function getContactKey(contact: any) {
  return (
    String(contact?.id || "").trim() ||
    String(contact?.email || "").trim().toLowerCase()
  );
}

export function getAgreementStatsForInspection({
  inspection,
  contactsByInspectionId,
  signedAgreementMap,
}: {
  inspection: any;
  contactsByInspectionId: Record<string, any[]>;
  signedAgreementMap: Map<string, any>;
}) {
  const inspectionId = String(inspection?.id || "");
  const contacts = contactsByInspectionId[inspectionId] || [];
  const requiredContacts = contacts.filter((contact) => Boolean(contact?.agreement_required));

  const unsignedRequiredContacts = requiredContacts.filter((contact) => {
    if (contact?.agreement_signed) return false;

    const contactKey = getContactKey(contact);
    if (contactKey && signedAgreementMap.has(contactKey)) return false;

    const email = String(contact?.email || "").trim().toLowerCase();
    if (email && signedAgreementMap.has(email)) return false;

    return true;
  });

  return {
    requiredCount: requiredContacts.length,
    unsignedCount: unsignedRequiredContacts.length,
    signedCount: Math.max(0, requiredContacts.length - unsignedRequiredContacts.length),
  };
}

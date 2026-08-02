// Canonical, server-enforceable answer to "may this report be shown to the
// client yet?" Used by /share, the PDF download, and the client portal so the
// paywall/agreement gate is enforced in one place instead of only in the UI.
//
// Rule: a client may see the report only when it is PUBLISHED and either
//   (a) payment is complete AND required agreements are signed/waived, or
//   (b) an owner/inspector set the delivery override ("Deliver anyway").
// Publishing is always required; the override only skips (a).
//
// These helpers take an already-loaded inspection row and (for the agreement
// check) an admin Supabase client, so they can run in any server context. The
// pure helpers (isPaymentComplete/isPublished) import nothing server-only and
// are safe to use from client components too.

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function isPaymentComplete(row: Record<string, any> | null | undefined) {
  if (!row) return false;

  const status = String(
    row.payment_status || row.invoice_status || "Unpaid"
  ).toLowerCase();

  const invoiceAmount = getNumber(
    row.invoice_amount ?? row.total_price ?? row.total ?? row.price
  );
  const amountPaid = getNumber(row.amount_paid);

  const storedBalance =
    row.balance_due !== null && row.balance_due !== undefined
      ? getNumber(row.balance_due)
      : Math.max(0, invoiceAmount - amountPaid);

  if (status === "paid" || status === "waived") return true;

  // A free/unpriced inspection has nothing to collect - treat it as complete
  // instead of leaving the client permanently locked out (audit finding M6).
  if (invoiceAmount <= 0 && storedBalance <= 0) return true;

  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;

  return storedBalance <= 0 && invoiceAmount > 0;
}

export function isPublished(row: Record<string, any> | null | undefined) {
  if (!row) return false;
  return Boolean(
    row.published ?? row.is_published ?? row.report_published
  );
}

export function hasDeliveryOverride(row: Record<string, any> | null | undefined) {
  return Boolean(row?.delivery_override);
}

// Required agreements are complete when the agreement is waived, or no contact
// still needs to sign. Reads inspection_contacts via the provided admin client.
export async function isAgreementComplete(
  admin: any,
  inspectionRow: Record<string, any>
) {
  if (inspectionRow?.agreement_waived === true) return true;

  const { data } = await admin
    .from("inspection_contacts")
    .select("agreement_required, agreement_signed, role")
    .eq("inspection_id", inspectionRow.id);

  // Only clients / co-clients can be required to sign — never realtors or other
  // roles, even if agreement_required got set on them.
  const unsigned = (data || []).filter((contact: any) => {
    const role = String(contact.role || "").toLowerCase();
    const isSigner = role === "client" || role === "co-client";
    return isSigner && contact.agreement_required && !contact.agreement_signed;
  });

  return unsigned.length === 0;
}

export type ReportDeliveryState = {
  published: boolean;
  paymentComplete: boolean;
  agreementComplete: boolean;
  override: boolean;
  requirementsMet: boolean;
  deliverable: boolean;
};

export async function getReportDeliveryState(
  admin: any,
  inspectionRow: Record<string, any>
): Promise<ReportDeliveryState> {
  const published = isPublished(inspectionRow);
  const override = hasDeliveryOverride(inspectionRow);
  const paymentComplete = isPaymentComplete(inspectionRow);
  const agreementComplete = await isAgreementComplete(admin, inspectionRow);
  const requirementsMet = paymentComplete && agreementComplete;

  return {
    published,
    paymentComplete,
    agreementComplete,
    override,
    requirementsMet,
    // Publishing is always required; the override only waives payment/agreement.
    deliverable: published && (override || requirementsMet),
  };
}

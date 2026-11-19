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

import { paidWithBalanceRemaining } from "./paymentSettled";

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

  // A refund returns money already collected — it is not a new balance and
  // must never re-lock a report the client already paid for.
  const amountRefunded = getNumber(row.amount_refunded);
  if ((amountRefunded > 0 || status.includes("refund")) && (amountPaid > 0 || Boolean(row.paid_at))) {
    return true;
  }

  // The inspector's explicit decisions: paid, waived, or payment not required
  // (e.g. imported reports).
  // ("Paid" with a recorded payment smaller than the invoice — the price was
  // raised after payment — still has a balance due.)
  if (status === "paid" && paidWithBalanceRemaining(row)) return false;
  if (status === "paid" || status === "waived" || status === "not required") return true;

  // A job with NO price used to count as paid ("nothing to collect"), so a
  // report published before the price was entered opened for free. Now it
  // stays locked until it's priced and paid, marked Waived / Not Required, or
  // the inspector uses "Deliver anyway".
  if (invoiceAmount <= 0) return false;

  if (amountPaid >= invoiceAmount) return true;

  return storedBalance <= 0;
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
/**
 * Pure agreement rule (tested). Clients / co-clients are the only signers.
 * - Waived -> complete.
 * - Some marked "agreement required" -> they must sign (or any one, when
 *   "one signature covers all clients" is on).
 * - Clients on file but none marked required -> the inspector chose no
 *   agreement for them (e.g. imported reports) -> complete.
 * - NO client on file at all -> complete only with a signed agreement on file.
 *   (This used to count as complete, so a job without a client contact opened
 *   without anyone signing.)
 */
export function agreementCompleteFrom(input: {
  waived: boolean;
  oneSigner: boolean;
  contacts: Array<{ role?: string | null; agreement_required?: boolean | null; agreement_signed?: boolean | null }>;
  signedOnFile: boolean;
}): boolean {
  if (input.waived) return true;
  const clients = (input.contacts || []).filter((contact) => {
    const role = String(contact?.role || "").toLowerCase();
    return role === "client" || role === "co-client";
  });
  const requiredSigners = clients.filter((contact) => Boolean(contact.agreement_required));

  if (requiredSigners.length > 0) {
    if (input.oneSigner) return requiredSigners.some((contact) => Boolean(contact.agreement_signed));
    return requiredSigners.every((contact) => Boolean(contact.agreement_signed));
  }
  if (clients.length > 0) return true;
  return input.signedOnFile;
}

export async function isAgreementComplete(
  admin: any,
  inspectionRow: Record<string, any>
) {
  if (inspectionRow?.agreement_waived === true) return true;

  const { data } = await admin
    .from("inspection_contacts")
    .select("agreement_required, agreement_signed, role")
    .eq("inspection_id", inspectionRow.id);

  // Only needed when there's no client contact: was an agreement signed anyway
  // (signing without a contact marks the inspection itself)?
  let signedOnFile = String(inspectionRow?.agreement_status || "").toLowerCase() === "signed";
  const hasClient = (data || []).some((contact: any) =>
    ["client", "co-client"].includes(String(contact.role || "").toLowerCase()),
  );
  if (!hasClient && !signedOnFile) {
    try {
      const { data: signed } = await admin
        .from("inspection_agreements")
        .select("id")
        .eq("inspection_id", inspectionRow.id)
        .eq("status", "signed")
        .limit(1);
      signedOnFile = Array.isArray(signed) && signed.length > 0;
    } catch {
      signedOnFile = false;
    }
  }

  return agreementCompleteFrom({
    waived: false,
    oneSigner: inspectionRow?.agreement_one_signer === true,
    contacts: data || [],
    signedOnFile,
  });
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

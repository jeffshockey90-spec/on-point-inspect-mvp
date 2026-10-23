// Builds the "what happened and when" line shown in the report payment panel,
// so Jeff can tell whether a payment was collected online, marked paid by hand
// (and by what method), or waived — without guessing from the status alone.

type InspectionRecord = Record<string, any>;

function formatStatusDate(value: any): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Reads the SAVED inspection record (not unsaved form state), so the line
// reflects what actually happened rather than whatever's currently selected.
export function getPaymentStatusDetail(inspection: InspectionRecord): string | null {
  const dateLabel = formatStatusDate(inspection?.paid_at);
  if (!dateLabel) return null;

  const status = String(inspection?.payment_status || inspection?.invoice_status || "");
  if (status === "Waived") return `Waived on ${dateLabel}`;
  if (status === "Paid") {
    if (inspection?.payment_method === "Stripe") return `Paid by client online on ${dateLabel}`;
    return inspection?.payment_method
      ? `Manually marked paid by ${inspection.payment_method} on ${dateLabel}`
      : `Manually marked paid on ${dateLabel}`;
  }
  return null;
}

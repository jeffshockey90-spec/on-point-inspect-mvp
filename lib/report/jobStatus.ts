// The builder's job status strip: Agreement · Payment · Report · Sent, each
// with a tone and a link to where it's fixed, plus the single "Next" step.
// Pure: the builder page passes in what it already knows.

export type StatusTone = "good" | "warn" | "bad" | "muted";
export type StatusChip = { key: "agreement" | "payment" | "report" | "sent"; label: string; value: string; tone: StatusTone; href: string };
export type NextStep = { title: string; detail: string; href: string; tone: StatusTone } | null;

export const STATUS_HREF = {
  agreement: "#agreement-status",
  payment: "#payment-invoice",
  report: "#report-actions",
  sent: "#report-actions",
} as const;

export function buildJobStatus(input: {
  agreementComplete: boolean;
  agreementWaived?: boolean;
  unsignedCount: number;
  unsignedNames?: string[];
  paymentComplete: boolean;
  balanceDue: number;
  currencySymbol?: string;
  published: boolean;
  reportSent: boolean;
  noReport: boolean; // orientation / verbal walkthrough
  noReportLabel?: string;
}): { chips: StatusChip[]; next: NextStep } {
  const money = (n: number) => `${input.currencySymbol ?? "$"}${Math.round(n * 100) / 100}`;
  const agreementOk = input.agreementComplete || Boolean(input.agreementWaived);

  const chips: StatusChip[] = [
    {
      key: "agreement",
      label: "Agreement",
      value: input.agreementWaived ? "Waived" : agreementOk ? "Signed" : input.unsignedCount > 0 ? `${input.unsignedCount} unsigned` : "Not set up",
      tone: agreementOk ? "good" : "bad",
      href: STATUS_HREF.agreement,
    },
    {
      key: "payment",
      label: "Payment",
      value: input.paymentComplete ? "Paid" : input.balanceDue > 0 ? `${money(input.balanceDue)} due` : "Unpaid",
      tone: input.paymentComplete ? "good" : "warn",
      href: STATUS_HREF.payment,
    },
    {
      key: "report",
      label: "Report",
      value: input.noReport ? "None" : input.published ? "Published" : "Draft",
      tone: input.noReport ? "muted" : input.published ? "good" : "warn",
      href: STATUS_HREF.report,
    },
    {
      key: "sent",
      label: "Sent",
      value: input.noReport ? "—" : input.reportSent ? "Sent" : "Not yet",
      tone: input.noReport ? "muted" : input.reportSent ? "good" : "warn",
      href: STATUS_HREF.sent,
    },
  ];

  let next: NextStep = null;
  if (!agreementOk) {
    const who = (input.unsignedNames || []).filter(Boolean);
    next = {
      title: "Next: get the agreement signed",
      detail: who.length ? `${who.join(" & ")} ${who.length === 1 ? "hasn't" : "haven't"} signed · Tap to see signatures` : "Tap to see signatures and send it",
      href: STATUS_HREF.agreement,
      tone: "bad",
    };
  } else if (!input.paymentComplete) {
    next = {
      title: "Next: collect payment",
      detail: input.balanceDue > 0 ? `${money(input.balanceDue)} still due · Tap to open the invoice` : "Tap to open the invoice",
      href: STATUS_HREF.payment,
      tone: "warn",
    };
  } else if (!input.noReport && !input.published) {
    next = { title: "Next: publish the report", detail: "Finish your findings, then tap Publish", href: STATUS_HREF.report, tone: "warn" };
  } else if (!input.noReport && !input.reportSent) {
    next = { title: "Next: send the report", detail: "Published — tap Send Report", href: STATUS_HREF.report, tone: "warn" };
  }
  return { chips, next };
}

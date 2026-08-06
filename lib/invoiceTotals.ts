// Shared invoice line-item normalization + totals. Lives in lib (not a route
// file) because Next.js only allows HTTP-method/config exports from route.ts.

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

// Normalize + total incoming line items. Amount is always derived server-side
// (quantity * unitPrice) so the client can never post an inconsistent amount.
export function computeInvoiceTotals(rawItems: any) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const normalized: InvoiceLineItem[] = items
    .map((li: any) => {
      const quantity = Math.max(0, Number(li?.quantity) || 0);
      const unitPrice = Math.round((Number(li?.unitPrice) || 0) * 100) / 100;
      const amount = Math.round(quantity * unitPrice * 100) / 100;
      return {
        description: String(li?.description || "").slice(0, 500),
        quantity,
        unitPrice,
        amount,
      };
    })
    // Drop fully-empty rows (no description and no amount).
    .filter((li) => li.description.trim() !== "" || li.amount > 0);

  const subtotal =
    Math.round(normalized.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
  return { normalized, subtotal };
}

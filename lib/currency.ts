const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formats a dollar amount (e.g. 69.5 -> "$70"). */
export function formatUsd(dollars: number): string {
  return usdFormatter.format(Number.isFinite(dollars) ? dollars : 0);
}

/** Formats a cent amount (e.g. 6900 -> "$69"). */
export function formatUsdFromCents(cents: number): string {
  return formatUsd((Number.isFinite(cents) ? cents : 0) / 100);
}

export const dynamic = "force-dynamic";

export default async function InvoicePaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; already?: string }>;
}) {
  const { cancelled, already } = await searchParams;

  const heading = cancelled
    ? "Payment cancelled"
    : already
      ? "This invoice is already paid"
      : "Payment received";

  const body = cancelled
    ? "Your payment was cancelled and you have not been charged. You can reopen the invoice link any time to pay."
    : already
      ? "Our records show this invoice has already been paid in full. No further action is needed."
      : "Thank you! Your payment was received. A confirmation will follow, and your invoice is now marked paid.";

  const tone = cancelled ? "#f59e0b" : "#14b8a6";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--fl-ground)] px-6 py-16 text-[var(--fl-text)]">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-8 text-center shadow-xl">
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
          style={{ background: `${tone}22`, color: tone }}
        >
          {cancelled ? "!" : "✓"}
        </div>
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="mt-3 leading-7 text-[var(--fl-muted)]">{body}</p>
      </div>
    </main>
  );
}

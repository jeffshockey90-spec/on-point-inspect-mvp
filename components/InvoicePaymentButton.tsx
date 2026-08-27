"use client";

import { useState } from "react";

export default function InvoicePaymentButton({
  inspectionId,
}: {
  inspectionId: number | string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPayment() {
    try {
      setLoading(true);
      setError("");

      const confirmed = window.confirm(
        "Online card payments through the portal include a small processing fee. Other approved payment methods may be available without this online fee. Continue to Stripe checkout?"
      );

      if (!confirmed) {
        return;
      }

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inspectionId }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error || "Could not create payment link.");
        return;
      }

      // window.open after an await gets silently killed by most mobile
      // popup blockers since it's no longer synchronously tied to the
      // click - navigate the current tab instead (same approach the
      // client-portal checkout already uses successfully).
      window.location.href = data.url;
    } catch {
      setError("Could not open payment page.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={openPayment}
        disabled={loading}
        title="Online card payments include a small portal processing fee."
        className="rounded-lg border border-green-500 px-3 py-2 text-xs font-semibold text-green-300 transition hover:bg-green-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Opening..." : "Pay Online"}
      </button>
      {error && <p className="text-xs font-bold text-red-400">{error}</p>}
    </div>
  );
}

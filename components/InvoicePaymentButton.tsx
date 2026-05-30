"use client";

import { useState } from "react";

export default function InvoicePaymentButton({
  inspectionId,
}: {
  inspectionId: number | string;
}) {
  const [loading, setLoading] = useState(false);

  async function openPayment() {
    try {
      setLoading(true);

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inspectionId }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        alert(data.error || "Could not create payment link.");
        return;
      }

      window.open(data.url, "_blank");
    } catch {
      alert("Could not open payment page.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openPayment}
      disabled={loading}
      className="rounded-lg border border-green-500 px-3 py-2 text-xs font-black text-green-300 transition hover:bg-green-500/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Opening..." : "Open Payment"}
    </button>
  );
}
"use client";

import { useState } from "react";

export default function SubscriptionCheckoutButton({ priceLabel }: { priceLabel: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/stripe/subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json();

      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Could not start checkout.");
      }

      window.location.href = json.url;
    } catch (err: any) {
      setError(err?.message || "Checkout failed.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="rounded-xl bg-teal-500 px-6 py-3 font-black text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening Checkout..." : `Subscribe ${priceLabel}`}
      </button>
      {error && <p className="text-sm font-bold text-red-300">{error}</p>}
    </div>
  );
}

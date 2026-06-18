"use client";

import { useState } from "react";

export default function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json();

      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Could not open billing portal.");
      }

      window.location.href = json.url;
    } catch (err: any) {
      setError(err?.message || "Could not open billing portal.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="rounded-xl border border-yellow-500 px-6 py-3 font-black text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-60"
      >
        {loading ? "Opening..." : "Manage / Cancel Subscription"}
      </button>

      {error && <p className="text-sm font-bold text-red-300">{error}</p>}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { isIOSNativeApp } from "../lib/nativePlatform";
import IOSSubscribeButton from "./IOSSubscribeButton";

export default function SubscriptionCheckoutButton({
  priceLabel,
  userId,
}: {
  priceLabel: string;
  userId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [iosApp, setIosApp] = useState(false);

  // Decide platform after mount so we never flash the Stripe control on iOS.
  useEffect(() => {
    setIosApp(isIOSNativeApp());
    setReady(true);
  }, []);

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

  if (!ready) return null;

  // App Store Guideline 3.1.1: inside the iOS app the subscription is sold with
  // In-App Purchase, never Stripe Checkout, and we show no price or link that
  // steers to an outside purchase -- IOSSubscribeButton takes its price text
  // straight from StoreKit. Web and Android keep using Stripe below.
  if (iosApp) {
    return (
      <div className="max-w-sm">
        <IOSSubscribeButton userId={userId} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening Checkout..." : `Subscribe ${priceLabel}`}
      </button>
      {error && <p className="text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>}
    </div>
  );
}

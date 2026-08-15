"use client";

import { useEffect, useState } from "react";
import { isIOSNativeApp } from "../lib/nativePlatform";

export default function SubscriptionCheckoutButton({ priceLabel }: { priceLabel: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [iosApp, setIosApp] = useState(false);

  // Decide platform after mount so we never flash a purchase control on iOS.
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

  // App Store Guideline 3.1.1: the iOS app must not sell the subscription and
  // must not include a button/link/CTA that steers to an outside purchase. On
  // iOS we show plain informational text only -- no purchase control, no link.
  // The FLOW subscription is a B2B service managed on the web. Web and Android
  // are unaffected.
  if (iosApp) {
    return (
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold leading-6 text-slate-200">
          Your FlowInspect subscription is managed on the web.
        </p>
        <p className="text-sm leading-6 text-slate-400">
          Start or manage your {priceLabel} plan at flowinspect.app from any web
          browser. Once it&apos;s active, sign back in here to keep creating
          inspections.
        </p>
      </div>
    );
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

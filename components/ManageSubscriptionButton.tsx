"use client";

import { useEffect, useState } from "react";
import { isIOSNativeApp } from "../lib/nativePlatform";

type ManageSubscriptionButtonProps = {
  flow?: "manage" | "cancel";
  label?: string;
  className?: string;
};

const DEFAULT_CLASS_BY_FLOW: Record<string, string> = {
  manage:
    "rounded-xl border border-yellow-500 px-6 py-3 font-black text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-60",
  cancel:
    "rounded-xl border border-red-500 px-6 py-3 font-black text-red-300 hover:bg-red-500/10 disabled:opacity-60",
};

const DEFAULT_LABEL_BY_FLOW: Record<string, string> = {
  manage: "Manage Billing",
  cancel: "Cancel Subscription",
};

export default function ManageSubscriptionButton({
  flow = "manage",
  label,
  className,
}: ManageSubscriptionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [iosApp, setIosApp] = useState(false);

  useEffect(() => {
    setIosApp(isIOSNativeApp());
    setReady(true);
  }, []);

  async function openPortal() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow }),
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

  if (!ready) return null;

  // App Store Guideline 3.1.1: subscription management (which can change plan /
  // payment) must not run inside the iOS app, and we don't include a link/CTA
  // that steers to an outside purchase. Show plain informational text only; the
  // web portal handles manage + cancel. Cancel renders nothing on iOS (the
  // single manage message covers it).
  if (iosApp) {
    if (flow === "cancel") return null;
    return (
      <p className="text-sm leading-6 text-slate-400">
        Manage or cancel your subscription anytime at flowinspect.app from a web
        browser.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className={className || DEFAULT_CLASS_BY_FLOW[flow]}
      >
        {loading ? "Opening..." : label || DEFAULT_LABEL_BY_FLOW[flow]}
      </button>

      {error && <p className="text-sm font-bold text-red-300">{error}</p>}
    </div>
  );
}
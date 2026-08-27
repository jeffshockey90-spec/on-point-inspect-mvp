"use client";

import { useEffect, useState } from "react";
import { isIOSNativeApp } from "../lib/nativePlatform";

type ManageSubscriptionButtonProps = {
  flow?: "manage" | "cancel";
  label?: string;
  className?: string;
  /** Who is billing this account — decides what iOS can offer. */
  billingSource?: "stripe" | "apple" | "exempt" | "trial" | "none";
};

const DEFAULT_CLASS_BY_FLOW: Record<string, string> = {
  manage:
    "rounded-xl border border-yellow-500 px-6 py-3 font-semibold text-[var(--fl-warn-text)] hover:bg-yellow-500/10 disabled:opacity-60",
  cancel:
    "rounded-xl border border-red-500 px-6 py-3 font-semibold text-[var(--fl-crit-text)] hover:bg-red-500/10 disabled:opacity-60",
};

const DEFAULT_LABEL_BY_FLOW: Record<string, string> = {
  manage: "Manage Billing",
  cancel: "Cancel Subscription",
};

export default function ManageSubscriptionButton({
  flow = "manage",
  label,
  className,
  billingSource = "stripe",
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

  if (iosApp) {
    // An App Store subscription is managed and cancelled in the App Store. Deep
    // linking there is managing an Apple purchase, not steering to an outside
    // one, so it's allowed -- and it's the only place Apple lets the user cancel.
    // One button covers both flows, so "cancel" renders nothing.
    if (billingSource === "apple") {
      if (flow === "cancel") return null;
      return (
        <a
          href="itms-apps://apps.apple.com/account/subscriptions"
          className={className || DEFAULT_CLASS_BY_FLOW.manage}
        >
          Manage Subscription
        </a>
      );
    }

    // Stripe-billed on iOS (bought on the web). The Stripe portal can change
    // payment, so it must not open in the app, and naming where to go instead
    // would be the steering Guideline 3.1.1 prohibits. Render nothing.
    return null;
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

      {error && <p className="text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAvailablePackages,
  purchase,
  restore,
  syncEntitlement,
  type PurchasePackage,
} from "../lib/revenuecat";

/**
 * Apple In-App Purchase control, shown only inside the iOS app.
 *
 * App Store Review Guideline 3.1.1: a subscription unlocked in the app has to be
 * buyable in the app. This is that purchase path. Price text comes from StoreKit
 * via RevenueCat rather than from our own pricing table, so what the inspector
 * sees is exactly what Apple will charge in their storefront and currency.
 *
 * "Restore Purchases" is required for any app selling auto-renewable
 * subscriptions — without it, review rejects on 3.1.1 regardless of the rest.
 */
export default function IOSSubscribeButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const available = await getAvailablePackages(userId);
        if (!cancelled) setPackages(available);
      } catch {
        if (!cancelled) setError("Could not load subscription options.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handlePurchase(pkg: PurchasePackage) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const entitled = await purchase(userId, pkg);

      if (!entitled) {
        setNotice("Purchase didn't complete. Nothing was charged.");
        return;
      }

      // Grant access now rather than waiting for the RevenueCat webhook.
      await syncEntitlement();
      router.refresh();
    } catch (err: any) {
      // StoreKit reports a user-initiated cancel as an error; that isn't a fault.
      if (err?.code === "1" || /cancel/i.test(err?.message || "")) {
        setNotice("Purchase cancelled.");
      } else {
        setError(err?.message || "Purchase failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const entitled = await restore(userId);
      await syncEntitlement();

      if (entitled) {
        router.refresh();
      } else {
        setNotice("No previous subscription found for this Apple ID.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not restore purchases.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[#8a93a3]">Loading subscription options...</p>;
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg) => (
        <button
          key={pkg.identifier}
          type="button"
          onClick={() => handlePurchase(pkg)}
          disabled={busy}
          className="w-full rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Working..." : `Subscribe ${pkg.priceString}/month`}
        </button>
      ))}

      {packages.length === 0 && !error && (
        <p className="text-sm text-[#8a93a3]">
          Subscription options aren&apos;t available right now. Please try again shortly.
        </p>
      )}

      <button
        type="button"
        onClick={handleRestore}
        disabled={busy}
        className="w-full rounded-xl border border-[#232b38] px-6 py-3 font-bold text-[#e8ecf3] hover:bg-[#1a212c] disabled:opacity-60"
      >
        Restore Purchases
      </button>

      {notice && <p className="text-sm font-bold text-yellow-300">{notice}</p>}
      {error && <p className="text-sm font-bold text-red-300">{error}</p>}
    </div>
  );
}

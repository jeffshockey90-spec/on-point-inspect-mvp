"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { SECURE24_BRAND } from "../lib/secure24Brand";

// Inspector-facing toggle: turn the Secure 24 home-security referral offer on or
// off for your clients. Default OFF -- clients never see it until you enable it.
export default function Secure24ReferralSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/secure24", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(d?.enabled === true))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle() {
    if (saving) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/secure24", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEnabled(data?.enabled === true);
    } catch {
      setEnabled(!next); // rollback
      setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-teal-400" />
          <div>
            <p className="font-black text-white">{SECURE24_BRAND} home-security referral</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
              Show your clients an optional offer on their report to be contacted by{" "}
              {SECURE24_BRAND} about a home-security system. Clients must opt in themselves —
              nothing is ever shared unless they choose it. You earn a referral payout on
              installs.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${SECURE24_BRAND} referral`}
          onClick={toggle}
          disabled={loading || saving}
          className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
            enabled ? "bg-teal-500" : "bg-slate-600"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error && <p className="mt-3 text-sm font-bold text-red-400">{error}</p>}
    </div>
  );
}

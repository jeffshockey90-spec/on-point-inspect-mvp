"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  SECURE24_BRAND,
  SECURE24_HEADLINE,
  SECURE24_BLURB,
  SECURE24_CONSENT_TEXT,
} from "../lib/secure24Brand";

// Optional home-security referral shown near the bottom of a client's report.
// Only rendered when the inspector enabled it. Nothing is sent unless the
// client ticks consent and taps the button.
export default function Secure24ReferralCard({
  shareToken,
  alreadyRequested = false,
}: {
  shareToken: string;
  alreadyRequested?: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    alreadyRequested ? "done" : "idle",
  );
  const [error, setError] = useState("");

  async function submit() {
    if (!consent || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/secure24/opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookup: shareToken, consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <section className="mt-10 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-400" />
          <div>
            <p className="font-black text-emerald-300">Request sent</p>
            <p className="mt-1 text-sm text-slate-300">
              Thanks — {SECURE24_BRAND} will reach out to you about home security.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-teal-400" />
        <div className="min-w-0">
          <h3 className="text-lg font-black text-white">{SECURE24_HEADLINE}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{SECURE24_BLURB}</p>

          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-500 bg-slate-800 accent-teal-500"
            />
            <span className="text-xs leading-5 text-slate-400">{SECURE24_CONSENT_TEXT}</span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={!consent || status === "sending"}
              className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-black text-slate-950 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "sending" ? "Sending…" : "Request a call"}
            </button>
            <span className="text-xs text-slate-500">
              Not interested? Just ignore this — nothing is sent unless you ask.
            </span>
          </div>

          {status === "error" && (
            <p className="mt-3 text-sm font-bold text-red-400">{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}

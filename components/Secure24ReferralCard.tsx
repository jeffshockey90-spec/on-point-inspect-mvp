"use client";

import { useEffect, useState } from "react";
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
  autoCheck = false,
}: {
  shareToken: string;
  alreadyRequested?: boolean;
  // When true (client portal), the card doesn't trust a server pre-check -- it
  // asks /api/secure24/status whether the inspector enabled it and hides itself
  // if not. When false (share page), the parent already gated visibility.
  autoCheck?: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    alreadyRequested ? "done" : "idle",
  );
  const [error, setError] = useState("");
  // In autoCheck mode we start hidden until the status endpoint confirms it's on.
  const [visible, setVisible] = useState(!autoCheck);

  useEffect(() => {
    if (!autoCheck || !shareToken) return;
    let active = true;
    fetch(`/api/secure24/status?lookup=${encodeURIComponent(shareToken)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.enabled) return;
        setVisible(true);
        if (d.alreadyRequested) setStatus("done");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [autoCheck, shareToken]);

  if (!visible) return null;

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
          <ShieldCheck className="h-6 w-6 shrink-0 text-[var(--fl-good-text)]" />
          <div>
            <p className="font-semibold text-[var(--fl-good-text)]">Request sent</p>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Thanks — {SECURE24_BRAND} will reach out to you about home security.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--fl-accent-text)]" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[var(--fl-text)]">{SECURE24_HEADLINE}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">{SECURE24_BLURB}</p>

          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--fl-faint)] bg-[var(--fl-raised)] accent-teal-500"
            />
            <span className="text-xs leading-5 text-[var(--fl-muted)]">{SECURE24_CONSENT_TEXT}</span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={!consent || status === "sending"}
              className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "sending" ? "Sending…" : "Request a call"}
            </button>
            <span className="text-xs text-[var(--fl-faint)]">
              Not interested? Just ignore this — nothing is sent unless you ask.
            </span>
          </div>

          {status === "error" && (
            <p className="mt-3 text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}

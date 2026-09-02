"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { INSURANCE_CONSENT_TEXT } from "../lib/insuranceReferral";

// Optional insurance-agent referral shown in the client portal. It only appears
// when the OWNING inspector turned on their own referral (per-inspector). It
// stays hidden until /api/insurance-referral/status confirms it's on. Nothing
// is sent and no link is opened unless the client ticks consent and taps the
// button.
export default function InsuranceReferralCard({
  shareToken,
  placement = "portal",
  viewerRole = "",
}: {
  shareToken: string;
  // Which surface this card is on, so the inspector's per-placement toggle
  // (report / portal / hub) and the hide-from-realtor toggle can gate it.
  placement?: "report" | "portal" | "hub";
  viewerRole?: string;
}) {
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentCompany, setAgentCompany] = useState("");
  const [blurb, setBlurb] = useState("");
  const [agentLink, setAgentLink] = useState("");

  useEffect(() => {
    if (!shareToken) return;
    let active = true;
    const q = new URLSearchParams({ lookup: shareToken, placement });
    if (viewerRole) q.set("role", viewerRole);
    fetch(`/api/insurance-referral/status?${q.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.enabled) return;
        setVisible(true);
        setAgentName(d.agentName || "");
        setAgentCompany(d.agentCompany || "");
        setBlurb(d.blurb || "");
        setAgentLink(d.agentLink || "");
        if (d.alreadyRequested) setStatus("done");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [shareToken, placement, viewerRole]);

  if (!visible) return null;

  const agentLabel =
    [agentName, agentCompany].filter(Boolean).join(" · ") || "my insurance agent";

  // Fire the opt-in (logs consent + notifies the agent). Returns the link, if any.
  async function optIn(): Promise<string | null> {
    const res = await fetch("/api/insurance-referral/opt-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookup: shareToken, consent: true }),
      keepalive: true,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
    return data?.link || null;
  }

  // Link referral: the anchor opens the link on the user's click (reliable, no
  // popup blocker), and we record the opt-in in the background.
  function onLinkClick() {
    if (!consent) return;
    setStatus("done");
    void optIn().catch(() => {});
  }

  // Email-only referral: send the lead, then confirm.
  async function onSendClick() {
    if (!consent || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      await optIn();
      setStatus("done");
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 shrink-0 text-[var(--fl-good-text)]" />
          <div>
            <p className="font-semibold text-[var(--fl-good-text)]">You're all set</p>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              {agentLink
                ? `Thanks — ${agentLabel} can now help with your home insurance. If the page didn't open, use the button below.`
                : `Thanks — ${agentLabel} will reach out to you about home insurance.`}
            </p>
            {agentLink && (
              <a
                href={agentLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-[var(--fl-raised)]"
              >
                Continue to {agentLabel} →
              </a>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--fl-accent-text)]" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[var(--fl-text)]">
            Need home insurance for this property?
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">
            {blurb ||
              `Your inspector works with a trusted insurance agent${
                agentName || agentCompany ? ` (${agentLabel})` : ""
              } who can help you get coverage for this home. It's completely optional.`}
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--fl-faint)] bg-[var(--fl-raised)] accent-teal-500"
            />
            <span className="text-xs leading-5 text-[var(--fl-muted)]">{INSURANCE_CONSENT_TEXT}</span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {agentLink ? (
              <a
                href={consent ? agentLink : undefined}
                target="_blank"
                rel="noreferrer"
                onClick={onLinkClick}
                aria-disabled={!consent}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                  consent
                    ? "cursor-pointer bg-teal-500 text-slate-950 hover:bg-teal-400"
                    : "cursor-not-allowed bg-teal-500/40 text-slate-950/60"
                }`}
              >
                Get a home insurance quote →
              </a>
            ) : (
              <button
                type="button"
                onClick={onSendClick}
                disabled={!consent || status === "sending"}
                className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "sending" ? "Sending…" : "Have the agent contact me"}
              </button>
            )}
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

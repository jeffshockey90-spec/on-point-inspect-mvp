"use client";

import { useEffect, useState } from "react";
import { Clapperboard, CheckCircle2 } from "lucide-react";

// Optional social-media / content-use consent shown to the client. Appears only
// when the inspector's company has the release enabled. The client can agree
// (types their name = their signature) or skip — it never blocks anything. Used
// on the client portal, the shared report, and the agreement-signing page.
export default function SocialMediaConsentCard({
  shareToken,
  placement = "portal",
}: {
  shareToken: string;
  placement?: "portal" | "report" | "signing";
}) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentName, setConsentName] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState("");
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    let active = true;
    fetch(`/api/social-media-consent/status?lookup=${encodeURIComponent(shareToken)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.enabled) return;
        setVisible(true);
        setText(d.text || "");
        setConsent(d.consent === true ? true : d.consent === false ? false : null);
        setConsentName(d.consentName || "");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [shareToken]);

  if (!visible || declined) return null;

  async function submit(grant: boolean) {
    if (status === "sending") return;
    if (grant && !name.trim()) {
      setError("Please type your name to agree.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/social-media-consent/opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookup: shareToken, consent: grant, name, source: placement }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
      if (grant) {
        setConsent(true);
        setConsentName(name.trim());
      } else {
        setDeclined(true);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  // Already agreed — show a confirmation.
  if (consent === true) {
    return (
      <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--fl-good-text)]" />
          <div>
            <p className="font-semibold text-[var(--fl-good-text)]">
              Thanks — you agreed to the content release
            </p>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              {consentName ? `Signed by ${consentName}. ` : ""}Your inspector may use photos/video
              from this inspection on social media, with no personal or identifying information
              shown. You can ask them to remove specific content anytime.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-teal-500/40 bg-gradient-to-br from-teal-500/10 via-[var(--fl-surface-2)] to-purple-500/10 p-6 shadow-xl">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-teal-400/40 bg-teal-500/15 text-[var(--fl-accent-text)]">
          <Clapperboard className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">Optional — and it really helps</p>
          <h3 className="mt-1 text-xl font-bold text-[var(--fl-text)]">
            Help a future homeowner? ✨
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
            Your inspector turns real inspection footage into quick, helpful tips on Facebook &amp; TikTok —
            the kind of thing that helps a buyer catch a problem before it costs them. If you&apos;re open to it,
            your inspection could be part of that, and <span className="font-semibold text-[var(--fl-text)]">nothing that identifies you is ever shown.</span>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {["✓ No address", "✓ No names", "✓ Remove anytime", "✓ Doesn't affect your report"].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-[var(--fl-accent-text)]"
              >
                {chip}
              </span>
            ))}
          </div>

          <details className="group mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)]/60 p-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--fl-accent-text)] [&::-webkit-details-marker]:hidden">
              Read the full release
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[var(--fl-muted)]">{text}</p>
          </details>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
              Type your name to agree
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="mt-1 w-full max-w-sm rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] placeholder:text-[var(--fl-faint)] focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={status === "sending" || !name.trim()}
              className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
            >
              {status === "sending" ? "Saving…" : "Yes — happy to help 🎬"}
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={status === "sending"}
              className="text-sm font-semibold text-[var(--fl-faint)] hover:text-[var(--fl-muted)] hover:underline disabled:opacity-50 [touch-action:manipulation]"
            >
              No thanks
            </button>
          </div>

          {error && <p className="mt-3 text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>}
        </div>
      </div>
    </section>
  );
}

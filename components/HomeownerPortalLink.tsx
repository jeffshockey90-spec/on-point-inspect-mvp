"use client";

import { useEffect, useState } from "react";
import { Home, Copy, Check } from "lucide-react";

// Copyable link to the buyer's Homeowner Portal (the maintenance/recall hub).
// Token-based so the homeowner never needs an account.
export default function HomeownerPortalLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  // Render the same origin the server used on the first client render so
  // hydration matches, then switch to the real window origin after mount.
  // (Reading window.location.origin during render made SSR and the client
  // disagree -> hydration mismatch on localhost/preview.)
  const [origin, setOrigin] = useState("https://app.flowinspect.app");
  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.origin) {
      setOrigin(window.location.origin);
    }
  }, []);
  const url = `${origin}/my-home/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still shown below to copy manually */
    }
  }

  return (
    <section className="rounded-2xl border border-teal-500/40 bg-teal-500/10 p-5">
      <div className="flex items-start gap-3">
        <Home className="mt-0.5 h-6 w-6 shrink-0 text-[var(--fl-accent-text)]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--fl-text)]">Homeowner Portal</p>
          <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">
            A simple maintenance hub for the buyer — their home&apos;s systems with expected life,
            recalls to watch, and a seasonal upkeep plan, all built from this inspection. Share the
            link; no account needed.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`/my-home/${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2 text-xs text-[var(--fl-accent-text)] hover:border-teal-400"
            >
              {url}
            </a>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-400"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import SettingsToggle from "./SettingsToggle";

// Per-INSPECTOR insurance-agent referral setup. Each inspector enters their own
// agent; this is private to their account and never shows for anyone else.
// Default OFF — clients only see it once this inspector turns it on and has
// entered a link or the agent's email.
export default function InsuranceReferralSettings() {
  const [enabled, setEnabled] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentCompany, setAgentCompany] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentLink, setAgentLink] = useState("");
  const [blurb, setBlurb] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/insurance-referral", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEnabled(d.enabled === true);
        setAgentName(d.agentName || "");
        setAgentCompany(d.agentCompany || "");
        setAgentPhone(d.agentPhone || "");
        setAgentEmail(d.agentEmail || "");
        setAgentLink(d.agentLink || "");
        setBlurb(d.blurb || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(nextEnabled?: boolean) {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    const payload = {
      enabled: typeof nextEnabled === "boolean" ? nextEnabled : enabled,
      agentName,
      agentCompany,
      agentPhone,
      agentEmail,
      agentLink,
      blurb,
    };
    try {
      const res = await fetch("/api/settings/insurance-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save. Please try again.");
      setEnabled(data.enabled === true);
      setAgentLink(data.agentLink || "");
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] placeholder:text-[var(--fl-faint)] focus:outline-none focus:ring-2 focus:ring-teal-400";

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--fl-accent-text)]" />
          <div>
            <p className="font-semibold text-[var(--fl-text)]">Insurance agent referral</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--fl-muted)]">
              Show your clients an optional card in their client portal to connect with{" "}
              <span className="font-semibold">your</span> insurance agent for home coverage.
              This is private to your account — it never appears for other inspectors, and each
              inspector sets up their own. Clients must opt in themselves; nothing is shared unless
              they choose it.
            </p>
          </div>
        </div>

        <SettingsToggle
          checked={enabled}
          disabled={loading || saving}
          ariaLabel="Insurance agent referral"
          onChange={(next) => {
            setEnabled(next);
            void save(next);
          }}
          className="mt-1"
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Agent name</span>
          <input className={field} value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Jane Smith" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Agency / company</span>
          <input className={field} value={agentCompany} onChange={(e) => setAgentCompany(e.target.value)} placeholder="Acme Insurance" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Agent phone</span>
          <input className={field} value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="(555) 555-1234" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Agent email</span>
          <input className={field} value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder="jane@acmeinsurance.com" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
            Agent link <span className="font-normal normal-case text-[var(--fl-faint)]">(quote or contact page)</span>
          </span>
          <input className={field} value={agentLink} onChange={(e) => setAgentLink(e.target.value)} placeholder="https://youragent.com/quote" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
            Short message to clients <span className="font-normal normal-case text-[var(--fl-faint)]">(optional)</span>
          </span>
          <textarea
            className={`${field} min-h-[72px] resize-y`}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="I work with Jane at Acme Insurance — she can get you a fast home insurance quote for this property."
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-[var(--fl-faint)]">
        Enter a <span className="font-semibold">link</span> (client goes straight to the agent's page)
        and/or an <span className="font-semibold">email</span> (the client's details are sent to the
        agent when they opt in). At least one is required to turn this on.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save()}
          disabled={loading || saving}
          className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save agent details"}
        </button>
        {saved && <span className="text-sm font-semibold text-[var(--fl-good-text)]">Saved.</span>}
        {error && <span className="text-sm font-bold text-[var(--fl-crit-text)]">{error}</span>}
      </div>
    </div>
  );
}

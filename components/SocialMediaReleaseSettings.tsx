"use client";

import { useEffect, useState } from "react";
import { Clapperboard } from "lucide-react";
import SettingsToggle from "./SettingsToggle";

// Owner-facing setup for the optional social-media / content-use release. Edit
// the text + turn it on/off. Default OFF — clients only see the consent once
// it's on. Company-level (applies to every inspection).
export default function SocialMediaReleaseSettings() {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [isOwner, setIsOwner] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/social-media-release", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEnabled(d.enabled === true);
        setText(d.text || "");
        setIsOwner(d.isOwner !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(nextEnabled?: boolean) {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/settings/social-media-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: typeof nextEnabled === "boolean" ? nextEnabled : enabled,
          text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save. Please try again.");
      setEnabled(data.enabled === true);
      setText(data.text || "");
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Clapperboard className="mt-0.5 h-6 w-6 shrink-0 text-[var(--fl-accent-text)]" />
          <div>
            <p className="font-semibold text-[var(--fl-text)]">Social media / content release</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--fl-muted)]">
              An optional consent shown to clients (at signing and on their portal/report) allowing
              you to use inspection photos/video on social media. Whether they agreed shows on the
              report builder and report. Default off; clients can always skip it.
            </p>
          </div>
        </div>

        <SettingsToggle
          checked={enabled}
          disabled={loading || saving || !isOwner}
          ariaLabel="Social media release"
          onChange={(next) => {
            setEnabled(next);
            void save(next);
          }}
          className="mt-1"
        />
      </div>

      {!isOwner && (
        <p className="mt-3 text-xs font-semibold text-[var(--fl-warn-text)]">
          Only the company owner can change this.
        </p>
      )}

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
          Release text (shown to the client)
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!isOwner}
          rows={14}
          className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm leading-6 text-[var(--fl-text)] placeholder:text-[var(--fl-faint)] focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60"
        />
      </label>

      <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="text-xs leading-5 text-[var(--fl-warn-text)]">
          ⚠️ This is a strong starting template, not legal advice. Because you&apos;re publishing
          content publicly, have an attorney licensed in your states (MD / PA / WV) review this
          wording before relying on it. Edit the text above to add your company name and anything
          your attorney recommends.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save()}
          disabled={loading || saving || !isOwner}
          className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save release"}
        </button>
        {saved && <span className="text-sm font-semibold text-[var(--fl-good-text)]">Saved.</span>}
        {error && <span className="text-sm font-bold text-[var(--fl-crit-text)]">{error}</span>}
      </div>
    </div>
  );
}

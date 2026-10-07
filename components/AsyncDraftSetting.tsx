"use client";

import { useEffect, useState } from "react";
import SettingsToggle from "./SettingsToggle";

type State = { enabled: boolean; perUser: boolean; global: boolean };

export default function AsyncDraftSetting() {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Owner-only global kill switch (null = unknown / not owner → hidden).
  const [ownerGlobal, setOwnerGlobal] = useState<boolean | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/async-draft", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setState(d);
      })
      .catch(() => {});
    // Owner probe: 200 → owner, show the kill switch; 403 → hide silently.
    fetch("/api/owner/async-draft", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && typeof d.global === "boolean") setOwnerGlobal(d.global);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function togglePerUser(next: boolean) {
    if (!state || saving) return;
    const prev = state;
    setError("");
    setSaving(true);
    setState({ ...state, perUser: next, enabled: state.global && next }); // optimistic
    try {
      const res = await fetch("/api/settings/async-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setState(data);
    } catch (e: any) {
      setState(prev); // rollback
      setError(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleGlobal(next: boolean) {
    if (ownerGlobal === null || savingGlobal) return;
    const prev = ownerGlobal;
    setSavingGlobal(true);
    setOwnerGlobal(next); // optimistic
    try {
      const res = await fetch("/api/owner/async-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setOwnerGlobal(Boolean(data.global));
      // reflect the new global state in the effective value shown above
      setState((s) => (s ? { ...s, global: Boolean(data.global), enabled: Boolean(data.global) && s.perUser } : s));
    } catch {
      setOwnerGlobal(prev); // rollback
    } finally {
      setSavingGlobal(false);
    }
  }

  const perUser = state?.perUser ?? false;
  const globalPaused = state ? !state.global : false;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-[var(--fl-text)]">
            Background AI drafting
            <span className="rounded-full border border-teal-400/40 bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
              Beta
            </span>
          </p>
          <p className="mt-1 break-words text-sm leading-6 text-[var(--fl-muted)]">
            In the live camera, after you tap Analyze the AI drafts in the
            background so you can keep capturing right away. When a draft is
            ready, a popup appears — tap it to review and approve. Nothing is
            saved to the report until you approve it.
          </p>
          {globalPaused && (
            <p className="mt-1 text-xs text-amber-400">
              Temporarily paused by admin — your setting is saved and will apply
              again once it's re-enabled.
            </p>
          )}
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
        <SettingsToggle
          checked={perUser}
          disabled={saving || state === null}
          onChange={togglePerUser}
          ariaLabel="Background AI drafting (beta)"
          className="mt-0.5"
        />
      </div>

      {ownerGlobal !== null && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
          <div className="min-w-0">
            <p className="font-medium text-[var(--fl-text)]">Global kill switch (owner)</p>
            <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">
              Master on/off for every beta user. Turn this off to instantly
              disable background drafting for everyone — no app update needed.
            </p>
          </div>
          <SettingsToggle
            checked={ownerGlobal}
            disabled={savingGlobal}
            onChange={toggleGlobal}
            ariaLabel="Async draft global kill switch"
            className="mt-0.5"
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import SettingsToggle from "./SettingsToggle";

// The "alert me when a client requests a referral" switch, shown right with the
// referral services so it's all in one place. Controls the same per-inspector
// pref as Settings → Notifications → "Referral request alerts" (default ON).
export default function ReferralAlertToggle() {
  const [on, setOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.referralRequests === "boolean") setOn(d.referralRequests);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function toggle(next: boolean) {
    if (saving) return;
    setSaving(true);
    setOn(next); // optimistic
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralRequests: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Could not save.");
      if (typeof d?.referralRequests === "boolean") setOn(d.referralRequests);
    } catch {
      setOn(!next); // rollback
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--fl-text)]">Alert me when a client requests a referral</span>
        <span className="mt-0.5 block text-xs text-[var(--fl-muted)]">
          Get a push notification whenever a client requests any referral service below. (This is a notification only — it doesn't turn a service on. Also in Settings → Notifications.)
        </span>
      </span>
      <SettingsToggle checked={on} disabled={saving || !loaded} onChange={toggle} ariaLabel="Referral request alerts" className="mt-0.5" />
    </div>
  );
}

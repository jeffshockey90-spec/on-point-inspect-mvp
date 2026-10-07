"use client";

import { useEffect, useState } from "react";
import SettingsToggle from "./SettingsToggle";

export default function CompassAutoSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/settings/compass-auto", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setEnabled(Boolean(d.enabled));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function toggle(next: boolean) {
    if (saving) return;
    const prev = enabled;
    setError("");
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/settings/compass-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setEnabled(Boolean(data.enabled));
    } catch (e: any) {
      setEnabled(prev ?? false); // rollback
      setError(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium text-[var(--fl-text)]">Always use the compass</p>
        <p className="mt-1 break-words text-sm leading-6 text-[var(--fl-muted)]">
          Turn the compass on automatically every time you open the live camera, so
          the finding&apos;s direction (N/S/E/W) fills in without tapping &ldquo;Enable
          compass.&rdquo; The first time, iOS still asks once for motion-sensor access.
        </p>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <SettingsToggle
        checked={enabled ?? false}
        disabled={saving || enabled === null}
        onChange={toggle}
        ariaLabel="Always use the compass"
        className="mt-0.5"
      />
    </div>
  );
}

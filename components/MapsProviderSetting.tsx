"use client";

import { useEffect, useState } from "react";

type Provider = "auto" | "apple" | "google";

// Lets the inspector choose which maps app opens for directions ("Start Drive").
// Stored per-device in localStorage (a maps-app choice is device-specific — you
// want Apple Maps on your iPhone, maybe Google on a laptop). "Auto" opens Apple
// Maps on Apple devices and Google elsewhere.
export default function MapsProviderSetting() {
  const [provider, setProvider] = useState<Provider>("auto");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const pref = localStorage.getItem("flow-maps-provider");
      if (pref === "apple" || pref === "google" || pref === "auto") setProvider(pref);
    } catch {}
  }, []);

  function choose(next: Provider) {
    setProvider(next);
    try {
      localStorage.setItem("flow-maps-provider", next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch {}
  }

  const options: { key: Provider; label: string; hint: string }[] = [
    { key: "auto", label: "Auto", hint: "Apple Maps on iPhone/iPad, Google elsewhere" },
    { key: "apple", label: "Apple Maps", hint: "Always open Apple Maps" },
    { key: "google", label: "Google Maps", hint: "Always open Google Maps" },
  ];

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--fl-text)]">Maps for directions</h3>
        {saved && <span className="text-xs font-semibold text-[var(--fl-good-text)]">Saved</span>}
      </div>
      <p className="mt-1 text-sm text-[var(--fl-muted)]">
        Which app opens when you tap Start Drive on an inspection.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {options.map((opt) => {
          const active = provider === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => choose(opt.key)}
              className={`rounded-xl border p-3 text-left transition [touch-action:manipulation] ${
                active
                  ? "border-teal-400 bg-teal-500/15"
                  : "border-[var(--fl-line)] bg-[var(--fl-ground)] hover:border-teal-400/60"
              }`}
            >
              <span
                className={`block text-sm font-semibold ${
                  active ? "text-[var(--fl-accent-text)]" : "text-[var(--fl-text)]"
                }`}
              >
                {opt.label}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--fl-muted)]">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

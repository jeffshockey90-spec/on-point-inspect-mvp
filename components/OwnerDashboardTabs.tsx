"use client";

import { useEffect, useState } from "react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payments", label: "Payments" },
  { key: "ai", label: "AI Usage" },
  { key: "users", label: "Users" },
  { key: "devices", label: "Devices & Push" },
  { key: "system", label: "System" },
];

// Shows one group of owner-dashboard sections at a time. Every taggable section
// carries a data-owner-tab attribute; this toggles their display to match the
// selected tab. Defaults to Overview on load. On desktop this renders as a
// vertical left rail (the app's shared sub-navigation pattern); on mobile it
// falls back to a horizontal scroll strip.
export default function OwnerDashboardTabs() {
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-owner-tab]");
    els.forEach((el) => {
      const owner = el.getAttribute("data-owner-tab") || "";
      el.style.display = owner === tab ? "" : "none";
    });
  }, [tab]);

  return (
    <div>
      {/* Mobile / tablet: horizontal scroll strip */}
      <div className="sticky top-0 z-30 -mx-4 flex gap-2 overflow-x-auto border-b border-[var(--fl-raised)] bg-[var(--fl-ground)] px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:hidden">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[#1ac5b4] bg-[#1ac5b4]/15 text-[var(--fl-accent-text)]"
                  : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)] hover:border-[var(--fl-faint)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: vertical left rail */}
      <nav className="hidden lg:block" aria-label="Owner dashboard sections">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-0.5 overflow-y-auto pr-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[#1ac5b4]/[0.12] text-[var(--fl-text)]"
                    : "text-[var(--fl-muted)] hover:bg-white/[0.04] hover:text-[var(--fl-text)]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                    active ? "bg-[#1ac5b4]" : "bg-transparent"
                  }`}
                />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

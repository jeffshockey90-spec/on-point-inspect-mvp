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
// selected tab. Defaults to Overview on load.
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
    <div className="sticky top-0 z-30 -mx-4 flex flex-wrap gap-2 border-b border-slate-800 bg-[#020617]/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
              active
                ? "border-teal-400 bg-teal-500/15 text-teal-200"
                : "border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type Counts = { all: number; inspector: number; client: number; realtor: number };

export default function UserRoleTabs({ counts }: { counts: Counts }) {
  const [tab, setTab] = useState<"all" | "inspector" | "client" | "realtor">("all");

  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>("[data-user-role]");
    rows.forEach((el) => {
      const role = el.getAttribute("data-user-role") || "other";
      el.style.display = tab === "all" || role === tab ? "" : "none";
    });
  }, [tab]);

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "inspector", label: "Inspectors", count: counts.inspector },
    { key: "client", label: "Clients", count: counts.client },
    { key: "realtor", label: "Realtors", count: counts.realtor },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition ${
              active
                ? "border-teal-400 bg-teal-500/15 text-teal-200"
                : "border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                active ? "bg-teal-400/20 text-teal-100" : "bg-slate-800 text-slate-400"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

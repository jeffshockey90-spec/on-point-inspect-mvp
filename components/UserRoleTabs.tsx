"use client";

import { useEffect, useState } from "react";

type Counts = { all: number; inspector: number; client: number; realtor: number; other: number };

export default function UserRoleTabs({ counts }: { counts: Counts }) {
  const [tab, setTab] = useState<"all" | "inspector" | "client" | "realtor" | "other">("all");

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
    { key: "other", label: "Other", count: counts.other },
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
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-teal-400 bg-teal-500/15 text-teal-200"
                : "border-[#232b38] bg-[#131923]/50 text-[#8a93a3] hover:border-[#59626f]"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                active ? "bg-teal-400/20 text-teal-100" : "bg-[#1a212c] text-[#8a93a3]"
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

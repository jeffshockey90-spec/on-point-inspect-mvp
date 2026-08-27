"use client";

import { useEffect, useState } from "react";

type Counts = { all: number; refund: number; dispute: number };

// Filters the refunds/disputes table rows by type. Each row carries a
// data-refund-type attribute ("refund" | "dispute").
export default function RefundFilterTabs({ counts }: { counts: Counts }) {
  const [filter, setFilter] = useState<"all" | "refund" | "dispute">("all");

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-refund-type]").forEach((el) => {
      const type = el.getAttribute("data-refund-type") || "";
      el.style.display = filter === "all" || type === filter ? "" : "none";
    });
  }, [filter]);

  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "refund", label: "Refunds", count: counts.refund },
    { key: "dispute", label: "Disputes", count: counts.dispute },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = filter === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-teal-400 bg-teal-500/15 text-teal-200"
                : "border-[#232b38] bg-[#131923]/50 text-[#8a93a3] hover:border-[#59626f]"
            }`}
          >
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-teal-400/20 text-teal-100" : "bg-[#1a212c] text-[#8a93a3]"}`}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

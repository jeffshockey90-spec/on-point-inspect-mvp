"use client";

import { useState } from "react";

export default function CollapsibleReportSection({
  title,
  subtitle,
  defaultOpen = false,
  accentClassName = "border-slate-700 text-slate-200",
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  accentClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-[#071224] px-5 py-4 text-left shadow-xl transition hover:bg-[#0b1a2e] ${accentClassName}`}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-black">{title}</h2>
          {subtitle && (
            <p className="mt-1 truncate text-xs font-semibold text-slate-400">{subtitle}</p>
          )}
        </div>

        <span className="shrink-0 text-sm font-black text-slate-400">
          {open ? "Hide ▲" : "Show ▼"}
        </span>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

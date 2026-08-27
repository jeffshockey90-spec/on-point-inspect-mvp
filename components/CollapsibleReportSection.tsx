"use client";

import { useState } from "react";

export default function CollapsibleReportSection({
  title,
  subtitle,
  defaultOpen = false,
  accentClassName = "border-[var(--fl-line)] text-[var(--fl-text)]",
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
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-[var(--fl-surface-2)] px-5 py-4 text-left shadow-xl transition hover:bg-[var(--fl-surface-2)] ${accentClassName}`}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-1 truncate text-xs font-semibold text-[var(--fl-muted)]">{subtitle}</p>
          )}
        </div>

        <span className="shrink-0 text-sm font-semibold text-[var(--fl-muted)]">
          {open ? "Hide ▲" : "Show ▼"}
        </span>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

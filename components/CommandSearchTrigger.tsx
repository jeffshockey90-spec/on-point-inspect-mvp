"use client";

import { Search } from "lucide-react";

// A visible "search bar" that opens the global ⌘K command palette. Rendered in
// the dashboard header so the palette is discoverable, not just a hidden hotkey.
export default function CommandSearchTrigger() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("flow:open-command-palette"))
      }
      className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-left transition hover:border-teal-400/60 hover:bg-[var(--fl-ground)]"
    >
      <Search className="h-4 w-4 shrink-0 text-[var(--fl-faint)] group-hover:text-[var(--fl-accent-text)]" strokeWidth={2.5} />
      <span className="flex-1 text-sm font-bold text-[var(--fl-muted)] group-hover:text-[var(--fl-text)]">
        Search FLOW — jump anywhere…
      </span>
      <kbd className="rounded-md border border-[var(--fl-line)] px-2 py-1 text-xs font-semibold text-[var(--fl-faint)]">
        ⌘K
      </kbd>
    </button>
  );
}

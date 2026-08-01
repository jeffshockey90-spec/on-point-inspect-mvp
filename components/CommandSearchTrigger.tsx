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
      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-700 bg-[#020617]/60 px-4 py-3 text-left transition hover:border-teal-400/60 hover:bg-[#020617]"
    >
      <Search className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-teal-300" strokeWidth={2.5} />
      <span className="flex-1 text-sm font-bold text-slate-400 group-hover:text-slate-200">
        Search FLOW — jump anywhere…
      </span>
      <kbd className="rounded-md border border-slate-700 px-2 py-1 text-xs font-black text-slate-500">
        ⌘K
      </kbd>
    </button>
  );
}

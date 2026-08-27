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
      className="group flex w-full items-center gap-3 rounded-2xl border border-[#232b38] bg-[#131923] px-4 py-3 text-left transition hover:border-teal-400/60 hover:bg-[#0a0e13]"
    >
      <Search className="h-4 w-4 shrink-0 text-[#59626f] group-hover:text-teal-300" strokeWidth={2.5} />
      <span className="flex-1 text-sm font-bold text-[#8a93a3] group-hover:text-[#e8ecf3]">
        Search FLOW — jump anywhere…
      </span>
      <kbd className="rounded-md border border-[#232b38] px-2 py-1 text-xs font-semibold text-[#59626f]">
        ⌘K
      </kbd>
    </button>
  );
}

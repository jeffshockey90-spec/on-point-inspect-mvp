"use client";

import { Search } from "lucide-react";

// Floating "Search" button shown on every inspector app page. The ⌘K command
// palette already works app-wide via a window keydown listener, but there was
// no visible affordance off the dashboard — and no way at all to open it on
// mobile (no keyboard). This dispatches the same event the palette listens for.
export default function GlobalSearchButton() {
  return (
    <button
      type="button"
      aria-label="Search FLOW — jump anywhere"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("flow:open-command-palette"))
      }
      className="fixed bottom-28 right-4 z-40 flex items-center gap-2 rounded-full border border-slate-700 bg-[#020617]/90 px-4 py-3 text-sm font-black text-slate-300 shadow-xl shadow-black/40 backdrop-blur transition active:scale-95 hover:border-teal-400/60 hover:text-teal-200 md:bottom-6 md:right-6 [touch-action:manipulation]"
    >
      <Search className="h-4 w-4" strokeWidth={2.5} />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden rounded-md border border-slate-700 px-1.5 py-0.5 text-[11px] font-black text-slate-500 md:inline">
        ⌘K
      </kbd>
    </button>
  );
}

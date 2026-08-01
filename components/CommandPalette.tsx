"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Command = {
  label: string;
  href: string;
  icon: string;
  group: "Actions" | "Go to";
  keywords?: string;
};

const COMMANDS: Command[] = [
  { label: "New Inspection", href: "/inspections/new", icon: "➕", group: "Actions", keywords: "create add job" },
  { label: "Field Tool", href: "/field", icon: "📱", group: "Actions", keywords: "capture onsite" },
  { label: "Import Report", href: "/import-report", icon: "📄", group: "Actions", keywords: "spectora migrate" },
  { label: "Dashboard", href: "/", icon: "🏠", group: "Go to", keywords: "home command center" },
  { label: "Reports", href: "/reports", icon: "📋", group: "Go to" },
  { label: "Schedule", href: "/schedule", icon: "🗓️", group: "Go to", keywords: "calendar availability" },
  { label: "Invoices", href: "/invoices", icon: "💵", group: "Go to", keywords: "payments billing money" },
  { label: "Quotes", href: "/quotes", icon: "💬", group: "Go to", keywords: "pricing estimate" },
  { label: "Agreements", href: "/agreements", icon: "📄", group: "Go to", keywords: "contract sign" },
  { label: "Realtors", href: "/realtors", icon: "🏡", group: "Go to", keywords: "agents contacts" },
  { label: "Mold", href: "/mold", icon: "🧪", group: "Go to", keywords: "environmental sample" },
  { label: "Radon", href: "/radon", icon: "☢️", group: "Go to", keywords: "environmental test" },
  { label: "AI Capture", href: "/ai-capture", icon: "✨", group: "Go to", keywords: "photo findings" },
  { label: "Templates", href: "/templates", icon: "📚", group: "Go to" },
  { label: "Dispatch", href: "/dispatch", icon: "🧭", group: "Go to", keywords: "assign team" },
  { label: "Mileage", href: "/mileage", icon: "🚗", group: "Go to", keywords: "trips tracking" },
  { label: "Sent Emails", href: "/emails", icon: "📧", group: "Go to", keywords: "delivery" },
  { label: "Analytics", href: "/analytics", icon: "📈", group: "Go to", keywords: "metrics stats" },
  { label: "What's New", href: "/whats-new", icon: "🚀", group: "Go to", keywords: "changelog updates" },
  { label: "Support", href: "/support", icon: "🛟", group: "Go to", keywords: "help feature request" },
  { label: "Settings", href: "/settings", icon: "⚙️", group: "Go to", keywords: "profile preferences" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((command) =>
      `${command.label} ${command.keywords || ""} ${command.group}`
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const run = useCallback(
    (command: Command) => {
      close();
      router.push(command.href);
    },
    [close, router],
  );

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("flow:open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("flow:open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <span className="text-slate-500">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                run(results[active]);
              }
            }}
            placeholder="Search FLOW — jump anywhere, start anything…"
            className="flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded-md border border-slate-700 px-2 py-1 text-xs font-black text-slate-500">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((command, index) => (
              <button
                key={command.href}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => run(command)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  index === active ? "bg-teal-500/15" : "hover:bg-slate-800/60"
                }`}
              >
                <span className="text-lg">{command.icon}</span>
                <span className="flex-1 text-sm font-bold text-white">
                  {command.label}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {command.group}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

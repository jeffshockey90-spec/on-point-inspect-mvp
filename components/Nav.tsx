"use client";

import Link from "next/link";
import { useState } from "react";

export default function Nav() {
  const [open, setOpen] = useState(false);

  const links = [
    { name: "Dashboard", href: "/" },
    { name: "New Inspection", href: "/new" },
    { name: "Reports", href: "/reports" },
    { name: "AI Capture", href: "/ai-capture" },
    { name: "Templates", href: "/templates" },
    { name: "Quote Calculator", href: "/quotes" },
    { name: "Report Builder", href: "/report-builder" },
    { name: "Email Workflow", href: "/email-workflow" },
    { name: "Client Portal", href: "/client/demo" },
    { name: "Schedule", href: "/schedule" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#050816]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold text-teal-400">
          On Point Inspect
        </Link>

        <button
          onClick={() => setOpen(!open)}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-teal-400 md:hidden"
        >
          {open ? "Close" : "Menu"}
        </button>

        <nav className="hidden flex-wrap gap-3 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-teal-400 hover:bg-teal-500 hover:text-black"
            >
              {link.name}
            </Link>
          ))}
        </nav>
      </div>

      {open && (
        <nav className="grid gap-3 border-t border-zinc-800 bg-black px-4 py-4 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-lg font-bold text-teal-400"
            >
              {link.name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
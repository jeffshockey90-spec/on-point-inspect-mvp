"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { name: "Dashboard", href: "/" },
  { name: "New Inspection", href: "/inspections/new" },
  { name: "AI Capture", href: "/report-builder" },
  { name: "Reports", href: "/reports" },
  { name: "Templates", href: "/templates" },
  { name: "Quote Calculator", href: "/quotes" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="w-full border-b border-zinc-800 bg-[#050816] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="text-2xl font-bold text-teal-400"
        >
          On Point Inspect
        </Link>

        <div className="flex flex-wrap gap-3">
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-teal-500 text-black border-teal-400"
                    : "bg-zinc-900 text-white border-zinc-700 hover:border-teal-400 hover:text-teal-300"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
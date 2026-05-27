"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { title: "Dashboard", href: "/", icon: "🏠", mobileLabel: "Home" },
  {
    title: "New Inspection",
    href: "/inspections/new",
    icon: "➕",
    mobileLabel: "New",
  },
  { title: "Reports", href: "/reports", icon: "📋", mobileLabel: "Reports" },
  {
    title: "Agreements",
    href: "/agreements",
    icon: "📄",
    mobileLabel: "Agreements",
  },
  {
    title: "AI Capture",
    href: "/report-builder",
    icon: "✨",
    mobileLabel: "AI",
  },
  {
    title: "Templates",
    href: "/templates",
    icon: "📚",
    mobileLabel: "Templates",
  },
  { title: "Quotes", href: "/quotes", icon: "💬", mobileLabel: "Quotes" },
  { title: "Schedule", href: "/schedule", icon: "🗓️", mobileLabel: "Schedule" },
];

export default function Navbar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <>
      {/* Desktop Navbar */}
      <header className="sticky top-0 z-50 hidden border-b border-zinc-800 bg-[#050816]/95 backdrop-blur md:block">
        <div className="mx-auto max-w-[1600px] px-5 py-3">
          <div className="flex items-center gap-5 rounded-2xl border border-slate-800 bg-[#0b1220]/95 px-5 py-4 shadow-2xl shadow-black/20">
            <Link
              href="/"
              className="flex min-w-[265px] shrink-0 items-center gap-4 border-r border-slate-700/70 pr-5"
            >
              <img
                src="/logo.jpg?v=2"
                alt="On Point Logo"
                className="h-16 w-16 shrink-0 rounded-full border border-teal-500/40 object-cover shadow-lg shadow-teal-500/10"
              />

              <div className="min-w-0 leading-tight">
                <div className="whitespace-nowrap text-2xl font-black text-teal-400">
                  On Point
                </div>

                <div className="whitespace-nowrap text-2xl font-black text-white">
                  Inspect
                </div>
              </div>
            </Link>

            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              {navItems.map((item) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold transition ${
                      active
                        ? "border-white/40 bg-gradient-to-r from-cyan-400 to-teal-400 text-black shadow-2xl shadow-cyan-500/40"
                        : "border-slate-700 bg-[#050816] text-teal-300 hover:border-teal-500 hover:bg-[#111827] hover:text-white"
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="whitespace-nowrap">{item.title}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Toolbar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-[74px] border-t border-zinc-800 bg-[#0b1220] md:hidden">
        <div className="flex h-full items-center justify-around">
          {navItems.slice(0, 4).map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.title}
                href={item.href}
                className={`flex h-full flex-1 flex-col items-center justify-center text-[11px] font-bold ${
                  active ? "text-teal-300" : "text-zinc-300"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>

                <span className="mt-1 leading-none">{item.mobileLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

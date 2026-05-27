"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { title: "Dashboard", href: "/" },
  { title: "New Inspection", href: "/inspections/new" },
  { title: "Reports", href: "/reports" },
  { title: "Agreements", href: "/agreements" },
  { title: "AI Capture", href: "/report-builder" },
  { title: "Templates", href: "/templates" },
  { title: "Quotes", href: "/quotes" },
  { title: "Schedule", href: "/schedule" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 hidden border-b border-zinc-800 bg-[#050816]/95 backdrop-blur md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-4">
            <img
              src="/logo.jpg?v=2"
              alt="On Point Logo"
              className="h-16 w-16 rounded-full border border-zinc-700 object-cover"
            />

            <div className="text-2xl font-black leading-tight text-teal-400">
              On Point
              <br />
              Inspect
            </div>
          </Link>

          <nav className="flex flex-wrap gap-3">
            {navItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`rounded-2xl border px-5 py-3 text-sm font-bold transition ${
                    active
                      ? "border-teal-500 bg-teal-500 text-black"
                      : "border-zinc-800 bg-[#0b1220] text-teal-400 hover:border-teal-500 hover:bg-[#111827]"
                  }`}
                >
                  {item.title === "Agreements" ? "📄 Agreements" : item.title}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 h-[74px] border-t border-zinc-800 bg-[#0b1220] md:hidden">
        <div className="flex h-full items-center justify-around">
          {navItems.slice(0, 4).map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.title}
                href={item.href}
                className={`flex h-full flex-1 flex-col items-center justify-center text-[11px] font-bold ${
                  active ? "text-teal-400" : "text-zinc-300"
                }`}
              >
                <span className="text-lg leading-none">
                  {item.title === "Dashboard"
                    ? "🏠"
                    : item.title === "New Inspection"
                    ? "➕"
                    : item.title === "Reports"
                    ? "📋"
                    : "📄"}
                </span>

                <span className="mt-1 leading-none">
                  {item.title === "Dashboard"
                    ? "Home"
                    : item.title === "New Inspection"
                    ? "New"
                    : item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
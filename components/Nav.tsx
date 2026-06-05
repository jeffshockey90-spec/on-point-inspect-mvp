"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  { title: "Dashboard", href: "/", icon: "🏠", mobileLabel: "Home" },
  { title: "New Inspection", href: "/inspections/new", icon: "➕", mobileLabel: "New" },
  { title: "Reports", href: "/reports", icon: "📋", mobileLabel: "Reports" },
  { title: "Realtors", href: "/realtors", icon: "🏡", mobileLabel: "Realtors" },
  { title: "Agreements", href: "/agreements", icon: "📄", mobileLabel: "Agreements" },
  { title: "AI Capture", href: "/ai-capture", icon: "✨", mobileLabel: "AI" },
  { title: "Templates", href: "/templates", icon: "📚", mobileLabel: "Templates" },
  { title: "Quotes", href: "/quotes", icon: "💬", mobileLabel: "Quotes" },
  { title: "Schedule", href: "/schedule", icon: "🗓️", mobileLabel: "Schedule" },
  { title: "Settings", href: "/settings", icon: "⚙️", mobileLabel: "Settings" },
];

const mobileItems = [
  { title: "Dashboard", href: "/", icon: "🏠", mobileLabel: "Home" },
  { title: "Reports", href: "/reports", icon: "📋", mobileLabel: "Reports" },
  { title: "New Inspection", href: "/inspections/new", icon: "➕", mobileLabel: "New" },
  { title: "AI Capture", href: "/ai-capture", icon: "✨", mobileLabel: "AI" },
  { title: "Settings", href: "/settings", icon: "⚙️", mobileLabel: "Settings" },
];

export default function Navbar() {
  const pathname = usePathname() || "";
  const router = useRouter();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      alert("Failed to log out.");
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 hidden border-b border-zinc-800 bg-[#050816]/95 backdrop-blur md:block">
        <div className="mx-auto max-w-[1600px] px-3 py-3 lg:px-5">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-800 bg-[#0b1220]/95 px-3 py-3 shadow-2xl shadow-black/20 lg:gap-5 lg:px-5 lg:py-4">
            <Link
              href="/"
              className="flex min-w-[185px] shrink-0 items-center gap-3 border-r border-slate-700/70 pr-3 lg:min-w-[250px] lg:gap-4 lg:pr-5"
            >
              <img
                src="/logo.jpg?v=2"
                alt="On Point Logo"
                className="h-12 w-12 shrink-0 rounded-full border border-teal-500/40 object-cover shadow-lg shadow-teal-500/10 lg:h-16 lg:w-16"
              />

              <div className="min-w-0 leading-tight">
                <div className="whitespace-nowrap text-xl font-black text-teal-400 lg:text-2xl">
                  On Point
                </div>
                <div className="whitespace-nowrap text-xl font-black text-white lg:text-2xl">
                  Inspect
                </div>
              </div>
            </Link>

            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:gap-3">
              {navItems.map((item) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-extrabold transition lg:px-4 lg:py-3 lg:text-sm ${
                      active
                        ? "border-white/40 bg-gradient-to-r from-cyan-400 to-teal-400 text-black shadow-2xl shadow-cyan-500/40"
                        : "border-slate-700 bg-[#050816] text-teal-300 hover:border-teal-500 hover:bg-[#111827] hover:text-white"
                    }`}
                  >
                    <span className="shrink-0 text-base leading-none">{item.icon}</span>
                    <span className="truncate whitespace-nowrap">{item.title}</span>
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-2xl border border-red-500 bg-red-950/30 px-3 py-2.5 text-xs font-extrabold text-red-300 transition hover:bg-red-500 hover:text-white lg:px-4 lg:py-3 lg:text-sm"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-[#0b1220]/98 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/40 md:hidden">
        <div className="grid h-[72px] grid-cols-6 items-stretch">
          {mobileItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-black transition ${
                  active
                    ? "bg-teal-500/10 text-teal-300"
                    : "text-zinc-300 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="max-w-full truncate leading-none">
                  {item.mobileLabel}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-black text-red-300 transition hover:bg-red-500/10"
          >
            <span className="text-lg leading-none">🚪</span>
            <span className="max-w-full truncate leading-none">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
}

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
                    key={item.href}
                    href={item.href}
                    prefetch={false}
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

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-2xl border border-red-500 bg-red-950/30 px-4 py-3 text-sm font-extrabold text-red-300 transition hover:bg-red-500 hover:text-white"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-[#0b1220]/95 shadow-2xl shadow-black/60 backdrop-blur md:hidden portrait:block landscape:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-[78px] w-full flex-row flex-nowrap items-stretch justify-between">
          {mobileItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-center text-xs font-black leading-none transition ${
                  active
                    ? "bg-teal-500/15 text-teal-300"
                    : "text-zinc-300 hover:bg-slate-800/70 hover:text-teal-300"
                }`}
              >
                <span className="block shrink-0 text-2xl leading-none">
                  {item.icon}
                </span>
                <span className="block max-w-full truncate leading-none">
                  {item.mobileLabel}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-center text-xs font-black leading-none text-red-300 transition hover:bg-red-950/30"
          >
            <span className="block shrink-0 text-2xl leading-none">🚪</span>
            <span className="block max-w-full truncate leading-none">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SupportUnreadBadge from "./SupportUnreadBadge";

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

const baseNavItems = [
  { title: "Dashboard", href: "/", icon: "🏠", mobileLabel: "Home" },
  { title: "New Inspection", href: "/inspections/new", icon: "➕", mobileLabel: "New" },
  { title: "Reports", href: "/reports", icon: "📋", mobileLabel: "Reports" },
  { title: "Realtors", href: "/realtors", icon: "🏡", mobileLabel: "Realtors" },
  { title: "Agreements", href: "/agreements", icon: "📄", mobileLabel: "Agreements" },
  { title: "AI Capture", href: "/ai-capture", icon: "✨", mobileLabel: "AI" },
  { title: "Templates", href: "/templates", icon: "📚", mobileLabel: "Templates" },
  { title: "Quotes", href: "/quotes", icon: "💬", mobileLabel: "Quotes" },
  { title: "Schedule", href: "/schedule", icon: "🗓️", mobileLabel: "Schedule" },
  { title: "Support", href: "/support", icon: "💬", mobileLabel: "Support" },
  { title: "Settings", href: "/settings", icon: "⚙️", mobileLabel: "Settings" },
];

const ownerNavItem = {
  title: "Owner",
  href: "/dashboard/owner",
  icon: "📈",
  mobileLabel: "Owner",
};

const baseMobileItems = [
  { title: "Dashboard", href: "/", icon: "🏠", mobileLabel: "Home" },
  { title: "Reports", href: "/reports", icon: "📋", mobileLabel: "Reports" },
  { title: "New Inspection", href: "/inspections/new", icon: "➕", mobileLabel: "New" },
  { title: "AI Capture", href: "/ai-capture", icon: "✨", mobileLabel: "AI" },
  { title: "Support", href: "/support", icon: "💬", mobileLabel: "Support" },
  { title: "Settings", href: "/settings", icon: "⚙️", mobileLabel: "Settings" },
];

export default function Navbar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingHref, setOpeningHref] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [isRealtor, setIsRealtor] = useState(false);
  const [isInspector, setIsInspector] = useState(true);
  const [reportsHref, setReportsHref] = useState("/reports");
  const [dashboardHref, setDashboardHref] = useState("/");

  useEffect(() => {
    let active = true;

    async function loadAccountRouting(fallbackEmail?: string) {
      try {
        const response = await fetch("/api/account-routing", {
          cache: "no-store",
        });

        const payload = await response.json().catch(() => ({}));

        if (!active) return;

        if (response.ok && payload?.authenticated) {
          const owner = Boolean(payload.isOwner);
          const realtor = Boolean(payload.isRealtor);
          const inspector = payload.isInspector !== false;

          setIsOwner(owner);
          setIsRealtor(realtor);
          setIsInspector(inspector);
          setReportsHref(payload.reportsHref || (realtor && !inspector ? "/realtor-portal" : "/reports"));
          setDashboardHref(payload.dashboardHref === "/dashboard" ? "/" : payload.dashboardHref || "/");
          return;
        }

        const email = String(fallbackEmail || "").toLowerCase();
        setIsOwner(OWNER_EMAILS.includes(email));
        setIsRealtor(false);
        setIsInspector(true);
        setReportsHref("/reports");
        setDashboardHref("/");
      } catch (error) {
        console.error("Account routing nav check failed:", error);

        if (!active) return;

        const email = String(fallbackEmail || "").toLowerCase();
        setIsOwner(OWNER_EMAILS.includes(email));
        setIsRealtor(false);
        setIsInspector(true);
        setReportsHref("/reports");
        setDashboardHref("/");
      }
    }

    async function loadInitialUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await loadAccountRouting(user?.email || "");
    }

    loadInitialUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadAccountRouting(session?.user?.email || "");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const visibleNavItems = useMemo(() => {
    let items = baseNavItems.map((item) => {
      if (item.href === "/") return { ...item, href: dashboardHref };
      if (item.href === "/reports") return { ...item, href: reportsHref };
      return item;
    });

    if (isRealtor && !isInspector) {
      items = items.filter((item) =>
        ["Dashboard", "Reports", "Support", "Settings"].includes(item.title)
      );

      items = items.map((item) => {
        if (item.title === "Dashboard") {
          return { ...item, href: "/realtor-portal", title: "Portal", mobileLabel: "Portal" };
        }

        if (item.title === "Reports") {
          return { ...item, href: "/realtor-portal" };
        }

        return item;
      });
    }

    const supportAwareItems = isOwner
      ? items.map((item) =>
          item.href === "/support"
            ? { ...item, title: "Support Chat", href: "/dashboard/owner/support" }
            : item
        )
      : items;

    return isOwner ? [...supportAwareItems, ownerNavItem] : supportAwareItems;
  }, [dashboardHref, reportsHref, isOwner, isRealtor, isInspector]);

  const visibleMobileItems = useMemo(() => {
    let items = baseMobileItems.map((item) => {
      if (item.href === "/") return { ...item, href: dashboardHref };
      if (item.href === "/reports") return { ...item, href: reportsHref };
      return item;
    });

    if (isRealtor && !isInspector) {
      items = [
        { title: "Portal", href: "/realtor-portal", icon: "🏡", mobileLabel: "Portal" },
        { title: "Reports", href: "/realtor-portal", icon: "📋", mobileLabel: "Reports" },
        { title: "Support", href: "/support", icon: "💬", mobileLabel: "Support" },
        { title: "Settings", href: "/settings", icon: "⚙️", mobileLabel: "Settings" },
      ];
    }

    const supportAwareItems = isOwner
      ? items.map((item) =>
          item.href === "/support"
            ? { ...item, title: "Support Chat", href: "/dashboard/owner/support" }
            : item
        )
      : items;

    return isOwner ? [...supportAwareItems, ownerNavItem] : supportAwareItems;
  }, [dashboardHref, reportsHref, isOwner, isRealtor, isInspector]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function prefetchRoute(href: string) {
    router.prefetch(href);
  }

  function handleNavClick(href: string) {
    if (href !== pathname) setOpeningHref(href);
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setLoggingOut(false);
    }
  }

  function NavSpinner({ active }: { active: boolean }) {
    if (!active) return null;

    return (
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 hidden border-b border-zinc-800 bg-[#050816]/95 backdrop-blur xl:block">
        <div className="mx-auto max-w-[1600px] px-5 py-3">
          <div className="flex items-center gap-5 rounded-2xl border border-slate-800 bg-[#0b1220]/95 px-5 py-4 shadow-2xl shadow-black/20">
            <Link
              href={dashboardHref}
              prefetch
              onPointerEnter={() => prefetchRoute(dashboardHref)}
              onClick={() => handleNavClick(dashboardHref)}
              className="flex min-w-[265px] shrink-0 items-center gap-4 border-r border-slate-700/70 pr-5 transition active:scale-[0.98] [touch-action:manipulation]"
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
              {visibleNavItems.map((item) => {
                const active = isActive(item.href);
                const opening = openingHref === item.href && !active;

                return (
                  <Link
                    key={`${item.title}-${item.href}`}
                    href={item.href}
                    prefetch
                    onPointerEnter={() => prefetchRoute(item.href)}
                    onTouchStart={() => prefetchRoute(item.href)}
                    onClick={() => handleNavClick(item.href)}
                    aria-busy={opening}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold transition active:scale-[0.98] [touch-action:manipulation] ${
                      active
                        ? "border-white/40 bg-gradient-to-r from-cyan-400 to-teal-400 text-black shadow-2xl shadow-cyan-500/40"
                        : opening
                          ? "border-teal-500 bg-[#111827] text-teal-300 opacity-80"
                          : item.href === "/dashboard/owner"
                            ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-300 hover:border-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-200"
                            : "border-slate-700 bg-[#050816] text-teal-300 hover:border-teal-500 hover:bg-[#111827] hover:text-white"
                    }`}
                  >
                    <NavSpinner active={opening} />
                    {!opening && <span className="text-base leading-none">{item.icon}</span>}
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      {opening ? "Opening..." : item.title}
                      {!opening && item.mobileLabel === "Support" && <SupportUnreadBadge />}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-busy={loggingOut}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500 bg-red-950/30 px-4 py-3 text-sm font-extrabold text-red-300 transition active:scale-[0.98] hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {loggingOut && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {loggingOut ? "Logging Out..." : "🚪 Logout"}
            </button>
          </div>
        </div>
      </header>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-[#0b1220]/95 shadow-2xl shadow-black/60 backdrop-blur md:hidden portrait:block landscape:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-[78px] w-full flex-row flex-nowrap items-center justify-between">
          {visibleMobileItems.map((item) => {
            const active = isActive(item.href);
            const opening = openingHref === item.href && !active;

            return (
              <Link
                key={`${item.title}-${item.href}`}
                href={item.href}
                prefetch
                onTouchStart={() => prefetchRoute(item.href)}
                onPointerEnter={() => prefetchRoute(item.href)}
                onClick={() => handleNavClick(item.href)}
                aria-busy={opening}
                className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5 text-center transition active:scale-[0.98] [touch-action:manipulation] ${
                  active
                    ? "bg-teal-500/15 text-teal-300"
                    : opening
                      ? "bg-slate-800/70 text-teal-300 opacity-80"
                      : item.href === "/dashboard/owner"
                        ? "text-yellow-300 hover:bg-yellow-500/10"
                        : "text-zinc-300 hover:bg-slate-800/70 hover:text-teal-300"
                }`}
              >
                <span className="flex w-full items-center justify-center text-xl leading-none">
                  {opening ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    item.icon
                  )}
                </span>
                <span className="mt-1 flex w-full items-center justify-center gap-1 text-center text-[10px] font-black leading-none whitespace-nowrap">
                  {opening ? "Opening" : item.mobileLabel}
                  {!opening && item.mobileLabel === "Support" && <SupportUnreadBadge className="min-h-4 min-w-4 px-1 text-[9px]" />}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-busy={loggingOut}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5 text-center text-red-300 transition active:scale-[0.98] hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
          >
            <span className="flex w-full items-center justify-center text-xl leading-none">
              {loggingOut ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                "🚪"
              )}
            </span>
            <span className="mt-1 block w-full text-center text-[10px] font-black leading-none whitespace-nowrap">
              {loggingOut ? "Leaving" : "Logout"}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

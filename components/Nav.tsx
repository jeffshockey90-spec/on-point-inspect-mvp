"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SupportUnreadBadge from "./SupportUnreadBadge";
import { isPortalRoute } from "../lib/navVisibility";

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

// Mirrors the tab list built in app/reports/[id]/page.tsx (reportSectionTabs)
// and the panel ids rendered by ReportBuilderSectionTabs - keep both in sync
// if a section's anchor id ever changes. Shown as a desktop-only (xl+)
// sidebar shortcut into the same tabs; clicking one just updates the URL
// hash, which ReportBuilderSectionTabs already listens for.
const REPORT_SECTION_LINKS = [
  { key: "disclaimers", label: "Disclaimers", anchorId: "report-disclaimers" },
  { key: "agreement", label: "Agreement", anchorId: "agreement-status" },
  { key: "payment", label: "Payment", anchorId: "payment-invoice" },
  { key: "delivery", label: "Delivery Guard", anchorId: "report-delivery-guard" },
  { key: "defects", label: "Defect Totals", anchorId: "defect-totals" },
  { key: "equipment", label: "Equipment", anchorId: "equipment-inventory" },
];

function isReportBuilderRoute(pathname: string) {
  return /^\/reports\/[^/]+$/.test(pathname);
}

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
  const openingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountRoutingAbortRef = useRef<AbortController | null>(null);
  const accountRoutingInFlightRef = useRef(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isRealtor, setIsRealtor] = useState(false);
  const [isInspector, setIsInspector] = useState(false);
  const [routingResolved, setRoutingResolved] = useState(false);
  const [reportsHref, setReportsHref] = useState("/reports");
  const [dashboardHref, setDashboardHref] = useState("/");
  const [userEmail, setUserEmail] = useState("");
  const [activeReportAnchor, setActiveReportAnchor] = useState("");

  function clearOpeningHref() {
    setOpeningHref("");

    if (openingTimeoutRef.current) {
      clearTimeout(openingTimeoutRef.current);
      openingTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    clearOpeningHref();
  }, [pathname]);

  useEffect(() => {
    function clear() {
      clearOpeningHref();
    }

    function clearOnAnyPageInteraction() {
      clearOpeningHref();
    }

    window.addEventListener("pageshow", clear);
    window.addEventListener("focus", clear);
    document.addEventListener("visibilitychange", clear);
    document.addEventListener("pointerdown", clearOnAnyPageInteraction, true);

    return () => {
      window.removeEventListener("pageshow", clear);
      window.removeEventListener("focus", clear);
      document.removeEventListener("visibilitychange", clear);
      document.removeEventListener("pointerdown", clearOnAnyPageInteraction, true);

      if (openingTimeoutRef.current) {
        clearTimeout(openingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    function applyRoutingFallback(fallbackEmail?: string) {
      if (!active) return;

      const email = String(fallbackEmail || "").toLowerCase();
      const owner = OWNER_EMAILS.includes(email);

      setIsOwner(owner);
      setIsRealtor(false);
      setIsInspector(Boolean(owner || email));
      setReportsHref(owner || email ? "/reports" : "/realtor-portal");
      setDashboardHref(owner || email ? "/" : "/realtor-portal");
      setRoutingResolved(true);
    }

    async function loadAccountRouting(fallbackEmail?: string) {
      if (accountRoutingInFlightRef.current) return;

      accountRoutingAbortRef.current?.abort();
      const controller = new AbortController();
      accountRoutingAbortRef.current = controller;
      accountRoutingInFlightRef.current = true;

      try {
        const response = await fetch("/api/account-routing", {
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));

        if (!active || controller.signal.aborted) return;

        if (response.ok && payload?.authenticated) {
          const owner = Boolean(payload.isOwner);
          const realtor = Boolean(payload.isRealtor);
          const inspector = payload.isInspector !== false;

          setIsOwner(owner);
          setIsRealtor(realtor);
          setIsInspector(inspector);
          setReportsHref(
            payload.reportsHref ||
              (realtor && !inspector ? "/realtor-portal" : "/reports"),
          );
          setDashboardHref(
            payload.dashboardHref === "/dashboard"
              ? "/"
              : payload.dashboardHref || "/",
          );
          setRoutingResolved(true);
          return;
        }

        applyRoutingFallback(fallbackEmail);
      } catch (error: any) {
        if (!active || error?.name === "AbortError") return;

        // A temporary network/session refresh failure should not break or hide
        // the navbar. Fall back to the authenticated email already available.
        applyRoutingFallback(fallbackEmail);
      } finally {
        if (accountRoutingAbortRef.current === controller) {
          accountRoutingAbortRef.current = null;
        }
        accountRoutingInFlightRef.current = false;
      }
    }

    async function loadInitialUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        await loadAccountRouting(user?.email || "");
      } catch {
        applyRoutingFallback();
      }
    }

    void loadInitialUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION" ||
          event === "USER_UPDATED"
        ) {
          void loadAccountRouting(session?.user?.email || "");
          return;
        }

        if (event === "SIGNED_OUT") {
          accountRoutingAbortRef.current?.abort();
          accountRoutingInFlightRef.current = false;
          setRoutingResolved(false);
        }
      },
    );

    return () => {
      active = false;
      accountRoutingAbortRef.current?.abort();
      accountRoutingAbortRef.current = null;
      accountRoutingInFlightRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserEmail(data?.user?.email || "");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        setUserEmail("");
        return;
      }
      setUserEmail(session?.user?.email || "");
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

  useEffect(() => {
    if (!isReportBuilderRoute(pathname)) {
      setActiveReportAnchor("");
      return;
    }

    function syncHash() {
      const hash = window.location.hash.replace(/^#/, "");
      setActiveReportAnchor(
        REPORT_SECTION_LINKS.some((link) => link.anchorId === hash)
          ? hash
          : REPORT_SECTION_LINKS[0].anchorId
      );
    }

    // ReportBuilderSectionTabs updates the hash via history.replaceState
    // (not a real navigation), which doesn't fire hashchange - it broadcasts
    // this event instead whenever the active tab changes.
    function handleTabChanged(event: Event) {
      const anchorId = (event as CustomEvent).detail?.anchorId;
      if (anchorId) setActiveReportAnchor(anchorId);
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("opi:report-tab-changed", handleTabChanged);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("opi:report-tab-changed", handleTabChanged);
    };
  }, [pathname]);

  function normalizeHref(href: string) {
    if (!href) return "/";
    return href.split("?")[0].replace(/\/$/, "") || "/";
  }

  function isActive(href: string) {
    const cleanHref = normalizeHref(href);
    const cleanPathname = normalizeHref(pathname);

    if (cleanHref === "/") return cleanPathname === "/";
    return cleanPathname === cleanHref || cleanPathname.startsWith(`${cleanHref}/`);
  }

  function prefetchRoute(href: string) {
    try {
      router.prefetch(href);
    } catch {}
  }

  function handleNavClick(href: string) {
    const active = isActive(href);

    if (active) {
      clearOpeningHref();
      return;
    }

    setOpeningHref(href);

    if (openingTimeoutRef.current) {
      clearTimeout(openingTimeoutRef.current);
    }

    openingTimeoutRef.current = setTimeout(() => {
      clearOpeningHref();
    }, 500);
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

  if (isPortalRoute(pathname) || !routingResolved) {
    return null;
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-zinc-800 bg-[#050816]/95 pt-[env(safe-area-inset-top)] backdrop-blur xl:flex">
        <Link
          href={dashboardHref}
          prefetch
          onPointerEnter={() => prefetchRoute(dashboardHref)}
          onClick={() => handleNavClick(dashboardHref)}
          className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-5 py-5 transition active:scale-[0.98] [touch-action:manipulation]"
        >
          <img
            src="/icons/icon-192.png?v=3"
            alt="FLOW Logo"
            className="h-11 w-11 shrink-0 rounded-xl border border-teal-500/40 object-cover shadow-lg shadow-teal-500/10"
          />

          <div className="min-w-0 leading-tight">
            <div className="whitespace-nowrap text-2xl font-black text-[#14c8d2]">
              FLOW
            </div>
          </div>
        </Link>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
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
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-extrabold transition active:scale-[0.98] [touch-action:manipulation] ${
                  active
                    ? "border-white/40 bg-teal-400 text-black shadow-lg shadow-teal-500/30"
                    : opening
                      ? "border-teal-500 bg-[#111827] text-teal-400 opacity-80"
                      : item.href === "/dashboard/owner"
                        ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-300 hover:border-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-200"
                        : "border-transparent text-teal-400 hover:border-teal-500 hover:bg-[#111827] hover:text-white"
                }`}
              >
                <NavSpinner active={opening} />
                {!opening && <span className="shrink-0 text-base leading-none">{item.icon}</span>}
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  {opening ? "Opening..." : item.title}
                </span>
                {!opening && item.mobileLabel === "Support" && <SupportUnreadBadge />}
              </Link>
            );
          })}

          {isReportBuilderRoute(pathname) && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <p className="px-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                Report Sections
              </p>

              <div className="mt-2 flex flex-col gap-1">
                {REPORT_SECTION_LINKS.map(({ key, label, anchorId }) => {
                  const active = activeReportAnchor === anchorId;

                  return (
                    <a
                      key={key}
                      href={`#${anchorId}`}
                      className={`rounded-xl border px-3 py-2 text-sm font-extrabold transition active:scale-[0.98] [touch-action:manipulation] ${
                        active
                          ? "border-white/40 bg-teal-400 text-black shadow-lg shadow-teal-500/30"
                          : "border-transparent text-teal-400 hover:border-teal-500 hover:bg-[#111827] hover:text-white"
                      }`}
                    >
                      {label}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="shrink-0 border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-[#0b1220]/95 px-3 py-2.5 shadow-lg shadow-black/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-sm font-black text-teal-300">
              {userEmail ? userEmail.charAt(0).toUpperCase() : "U"}
            </div>

            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-bold text-white">
                {userEmail || "Signed in"}
              </div>
              <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {isOwner ? "Owner" : isRealtor && !isInspector ? "Realtor" : "Inspector"}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-busy={loggingOut}
              title="Logout"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/60 text-red-300 transition active:scale-[0.98] hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {loggingOut ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                "🚪"
              )}
            </button>
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-[100] border-t border-zinc-800 bg-[#0b1220]/95 shadow-2xl shadow-black/60 backdrop-blur md:hidden portrait:block landscape:hidden [transform:translateZ(0)] [will-change:transform]"
        style={{ bottom: 0, paddingBottom: "env(safe-area-inset-bottom)", transform: "translateZ(0)" }}
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

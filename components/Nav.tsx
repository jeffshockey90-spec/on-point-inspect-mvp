"use client";

import { OWNER_EMAILS } from "../lib/ownerEmails";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SupportUnreadBadge from "./SupportUnreadBadge";
import ThemeToggle from "./ThemeToggle";
import { isPortalRoute } from "../lib/navVisibility";
import {
  Home,
  Plus,
  Smartphone,
  FileText,
  FlaskConical,
  Radiation,
  Building2,
  FileSignature,
  Mail,
  Sparkles,
  LayoutTemplate,
  Calculator,
  CalendarDays,
  Compass,
  Car,
  LifeBuoy,
  Rocket,
  Settings,
  Crown,
  LogOut,
} from "lucide-react";



// Grouped into a few labelled categories so the sidebar reads as ~4 short lists
// instead of one long 18-item scroll. Dashboard stays ungrouped at the top;
// items are ordered so each `group` is contiguous (the render inserts a header
// when the group changes).
const baseNavItems = [
  { title: "Dashboard", href: "/", icon: Home, mobileLabel: "Home" },
  // Inspect
  { title: "New Inspection", href: "/inspections/new", icon: Plus, mobileLabel: "New", group: "Inspect" },
  { title: "Schedule", href: "/schedule", icon: CalendarDays, mobileLabel: "Schedule", group: "Inspect" },
  { title: "Field Tool", href: "/field", icon: Smartphone, mobileLabel: "Field", group: "Inspect" },
  { title: "AI Capture", href: "/ai-capture", icon: Sparkles, mobileLabel: "AI", group: "Inspect" },
  { title: "Dispatch", href: "/dispatch", icon: Compass, mobileLabel: "Dispatch", group: "Inspect" },
  { title: "Mold", href: "/mold", icon: FlaskConical, mobileLabel: "Mold", group: "Inspect" },
  { title: "Radon", href: "/radon", icon: Radiation, mobileLabel: "Radon", group: "Inspect" },
  // Deliver
  { title: "Reports", href: "/reports", icon: FileText, mobileLabel: "Reports", group: "Deliver" },
  { title: "Agreements", href: "/agreements", icon: FileSignature, mobileLabel: "Agreements", group: "Deliver" },
  { title: "Templates", href: "/templates", icon: LayoutTemplate, mobileLabel: "Templates", group: "Deliver" },
  { title: "Sent Emails", href: "/emails", icon: Mail, mobileLabel: "Emails", group: "Deliver" },
  // Grow
  { title: "Realtors", href: "/realtors", icon: Building2, mobileLabel: "Realtors", group: "Grow" },
  { title: "Quotes", href: "/quotes", icon: Calculator, mobileLabel: "Quotes", group: "Grow" },
  { title: "Mileage", href: "/mileage", icon: Car, mobileLabel: "Mileage", group: "Grow" },
  // Account
  { title: "Support", href: "/support", icon: LifeBuoy, mobileLabel: "Support", group: "Account" },
  { title: "What's New", href: "/whats-new", icon: Rocket, mobileLabel: "New", group: "Account" },
  { title: "Settings", href: "/settings", icon: Settings, mobileLabel: "Settings", group: "Account" },
];

const ownerNavItem = {
  title: "Owner",
  href: "/dashboard/owner",
  icon: Crown,
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
  { title: "Dashboard", href: "/", icon: Home, mobileLabel: "Home" },
  { title: "Reports", href: "/reports", icon: FileText, mobileLabel: "Reports" },
  { title: "New Inspection", href: "/inspections/new", icon: Plus, mobileLabel: "New" },
  { title: "AI Capture", href: "/ai-capture", icon: Sparkles, mobileLabel: "AI" },
  { title: "Support", href: "/support", icon: LifeBuoy, mobileLabel: "Support" },
  { title: "Settings", href: "/settings", icon: Settings, mobileLabel: "Settings" },
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
  // routingResolved is still tracked (the setters run) but the nav no longer
  // gates its render on it -- see the render guard below.
  const [, setRoutingResolved] = useState(false);
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
        { title: "Portal", href: "/realtor-portal", icon: Building2, mobileLabel: "Portal" },
        { title: "Reports", href: "/realtor-portal", icon: FileText, mobileLabel: "Reports" },
        { title: "Support", href: "/support", icon: LifeBuoy, mobileLabel: "Support" },
        { title: "Settings", href: "/settings", icon: Settings, mobileLabel: "Settings" },
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

  // Render the navbar immediately on app routes instead of waiting for
  // /api/account-routing to resolve. Gating on `!routingResolved` left the nav
  // invisible/unclickable for the whole auth + routing round-trip on every
  // fresh load, so early taps landed on nothing -- the "have to click twice /
  // feels delayed" problem. We start with the sensible default (inspector) nav
  // and refine it (owner item, realtor portal collapse) the moment routing
  // resolves. Public/portal surfaces (login, signup, share, ...) still hide it.
  if (isPortalRoute(pathname)) {
    return null;
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-[var(--fl-raised)] bg-[var(--fl-ground)] pt-[env(safe-area-inset-top)] backdrop-blur xl:flex">
        <Link
          href={dashboardHref}
          prefetch
          onPointerEnter={() => prefetchRoute(dashboardHref)}
          onClick={() => handleNavClick(dashboardHref)}
          className="flex shrink-0 items-center gap-3 border-b border-[var(--fl-raised)] px-5 py-[18px] transition active:scale-[0.98] [touch-action:manipulation]"
        >
          <img
            src="/icons/icon-192.png?v=3"
            alt="FLOW Logo"
            className="h-9 w-9 shrink-0 rounded-[10px] border border-[#1ac5b4]/35 object-cover"
          />

          <div className="min-w-0 leading-tight">
            <div className="whitespace-nowrap text-[19px] font-extrabold tracking-tight text-[var(--fl-text)]">
              FLOW
            </div>
          </div>
        </Link>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {(() => {
            // Show category headers for the full inspector/owner nav; the trimmed
            // realtor-portal nav (4 items) reads better as a flat list.
            const showGroups = !(isRealtor && !isInspector);
            let prevGroup: string | null = null;

            return visibleNavItems.map((item) => {
              const active = isActive(item.href);
              const opening = openingHref === item.href && !active;
              const ItemIcon = item.icon;
              const group = (item as any).group as string | undefined;
              const groupLabel =
                showGroups && group && group !== prevGroup ? group : null;
              prevGroup = group || prevGroup;

              return (
                <Fragment key={`${item.title}-${item.href}`}>
                  {groupLabel && (
                    <p className="mt-4 px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--fl-faint)]">
                      {groupLabel}
                    </p>
                  )}
                  <Link
                    href={item.href}
                    prefetch
                    onPointerEnter={() => prefetchRoute(item.href)}
                    onTouchStart={() => prefetchRoute(item.href)}
                    onClick={() => handleNavClick(item.href)}
                    aria-busy={opening}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition active:scale-[0.98] [touch-action:manipulation] ${
                      active
                        ? "bg-[#1ac5b4]/[0.12] text-[var(--fl-text)]"
                        : opening
                          ? "bg-white/[0.04] text-[#1ac5b4]"
                          : item.href === "/dashboard/owner"
                            ? "text-yellow-300/90 hover:bg-yellow-500/10 hover:text-yellow-200"
                            : "text-[var(--fl-muted)] hover:bg-white/[0.04] hover:text-[var(--fl-text)]"
                    }`}
                  >
                    <NavSpinner active={opening} />
                    {!opening && <ItemIcon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-[#1ac5b4]" : ""}`} strokeWidth={2} />}
                    <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                      {opening ? "Opening..." : item.title}
                    </span>
                    {!opening && item.mobileLabel === "Support" && <SupportUnreadBadge />}
                  </Link>
                </Fragment>
              );
            });
          })()}

          {isReportBuilderRoute(pathname) && (
            <div className="mt-4 border-t border-[var(--fl-raised)] pt-4">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--fl-faint)]">
                Report Sections
              </p>

              <div className="mt-2 flex flex-col gap-1">
                {REPORT_SECTION_LINKS.map(({ key, label, anchorId }) => {
                  const active = activeReportAnchor === anchorId;

                  return (
                    <a
                      key={key}
                      href={`#${anchorId}`}
                      className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition active:scale-[0.98] [touch-action:manipulation] ${
                        active
                          ? "bg-[#1ac5b4]/[0.12] text-[var(--fl-text)]"
                          : "text-[var(--fl-muted)] hover:bg-white/[0.04] hover:text-[var(--fl-text)]"
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

        <div className="shrink-0 border-t border-[var(--fl-raised)] p-3">
          <div className="flex items-center gap-3 rounded-[10px] border border-[var(--fl-raised)] bg-[var(--fl-surface)] px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1ac5b4]/12 text-xs font-semibold text-[#1ac5b4]">
              {userEmail ? userEmail.charAt(0).toUpperCase() : "U"}
            </div>

            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-bold text-[var(--fl-text)]">
                {userEmail || "Signed in"}
              </div>
              <div className="truncate text-[10px] font-bold uppercase tracking-wide text-[var(--fl-faint)]">
                {isOwner ? "Owner" : isRealtor && !isInspector ? "Realtor" : "Inspector"}
              </div>
            </div>

            <ThemeToggle compact />

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-busy={loggingOut}
              title="Logout"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--fl-line)] text-[var(--fl-muted)] transition active:scale-[0.98] hover:border-red-500/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {loggingOut ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <LogOut className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-[100] border-t border-zinc-800 bg-[var(--fl-surface)] shadow-2xl shadow-black/60 backdrop-blur xl:hidden [transform:translateZ(0)] [will-change:transform]"
        style={{ bottom: 0, paddingBottom: "env(safe-area-inset-bottom)", transform: "translateZ(0)" }}
      >
        <div className="flex h-[78px] w-full flex-row flex-nowrap items-center justify-between">
          {visibleMobileItems.map((item) => {
            const active = isActive(item.href);
            const opening = openingHref === item.href && !active;
            const ItemIcon = item.icon;

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
                    ? "bg-teal-500/15 text-[var(--fl-accent-text)]"
                    : opening
                      ? "bg-[var(--fl-raised)] text-[var(--fl-accent-text)] opacity-80"
                      : item.href === "/dashboard/owner"
                        ? "text-yellow-300 hover:bg-yellow-500/10"
                        : "text-zinc-300 hover:bg-[var(--fl-raised)] hover:text-[var(--fl-accent-text)]"
                }`}
              >
                <span className="flex w-full items-center justify-center leading-none">
                  {opening ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <ItemIcon className="h-5 w-5" strokeWidth={2.25} />
                  )}
                </span>
                <span className="mt-1 flex w-full items-center justify-center gap-1 text-center text-[10px] font-semibold leading-none whitespace-nowrap">
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
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5 text-center text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
          >
            <span className="flex w-full items-center justify-center text-xl leading-none">
              {loggingOut ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                "🚪"
              )}
            </span>
            <span className="mt-1 block w-full text-center text-[10px] font-semibold leading-none whitespace-nowrap">
              {loggingOut ? "Leaving" : "Logout"}
            </span>
          </button>

          <ThemeToggle variant="mobile" />
        </div>
      </nav>

      {userEmail && !isOwner && !isPortalRoute(pathname) && (
        <Link
          href="/support"
          className="fixed bottom-40 right-4 z-[150] flex items-center gap-2 rounded-full border border-amber-400/60 bg-[var(--fl-surface)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-amber-300 shadow-2xl shadow-black/40 transition hover:border-amber-300 hover:text-amber-200 active:scale-[0.97] xl:bottom-20"
        >
          💡 Suggest
        </Link>
      )}
    </>
  );
}

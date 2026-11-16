"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveInitialTab, tabForHash, type ShareTab } from "../lib/shareTabs";

type Props = {
  initialTab?: ShareTab;
  showSummary?: boolean;
  showDisclaimers?: boolean;
  showStandards?: boolean;
  showEquipment?: boolean;
  showPriority?: boolean;
  showMaintenance?: boolean;
};

const TAB_LABELS: Array<{ key: ShareTab; label: string; tone: string }> = [
  { key: "summary", label: "Summary", tone: "border-teal-500 text-[var(--fl-accent-text)]" },
  { key: "full", label: "Full Report", tone: "border-cyan-500 text-[var(--fl-info-text)]" },
  { key: "disclaimers", label: "Disclaimers", tone: "border-purple-500 text-[var(--fl-purple-text)]" },
  { key: "standards", label: "Standards", tone: "border-sky-500 text-[var(--fl-info-text)]" },
  { key: "equipment", label: "Equipment", tone: "border-emerald-500 text-[var(--fl-good-text)]" },
  // Rightmost on purpose.
  { key: "priority", label: "🧭 Priority Repairs", tone: "border-teal-500 text-[var(--fl-accent-text)]" },
  { key: "maintenance", label: "🔧 Maintenance Tips", tone: "border-emerald-500 text-[var(--fl-good-text)]" },
];

function classifyPanel(element: HTMLElement): ShareTab {
  if (element.id === "client-summary") return "summary";
  if (element.id === "priority-repairs") return "priority";
  if (element.id === "maintenance-tips") return "maintenance";
  if (element.id === "report-disclaimers") return "disclaimers";
  if (element.id === "standards-of-practice") return "standards";
  if (element.id === "equipment-inventory") return "equipment";
  return "full";
}

export default function ShareReportTabs({
  initialTab = "summary",
  showSummary = true,
  showDisclaimers = true,
  showStandards = true,
  showEquipment = true,
  showPriority = false,
  showMaintenance = true,
}: Props) {
  // A clean report (no defects) has no Summary panel — open Full Report then.
  const startTab = resolveInitialTab(initialTab, showSummary);
  const [activeTab, setActiveTab] = useState<ShareTab>(startTab);
  const navRef = useRef<HTMLDivElement | null>(null);

  const applyTab = useCallback((nextTab: ShareTab, scrollToTabs = false) => {
    const nav = navRef.current;
    const parent = nav?.parentElement;
    if (!nav || !parent) return;

    let sibling = nav.nextElementSibling as HTMLElement | null;
    while (sibling) {
      const panelTab = classifyPanel(sibling);
      sibling.hidden = panelTab !== nextTab;
      sibling.setAttribute("aria-hidden", panelTab === nextTab ? "false" : "true");
      sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    setActiveTab(nextTab);

    if (scrollToTabs) {
      nav.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, []);

  // Bring a hash target into view: switch to its tab, clear a severity filter
  // that would hide the finding (display:none has no scroll position), open the
  // phone's collapsed card, then scroll.
  const goToHash = useCallback(
    (hash: string, updateUrl: boolean) => {
      const targetTab = tabForHash(hash);
      if (!targetTab) return false;
      applyTab(targetTab, true);

      const targetId = hash.replace(/^#/, "");
      if (hash.startsWith("#finding-")) {
        const findings = document.getElementById("inspection-findings");
        if (findings && findings.getAttribute("data-filter") && findings.getAttribute("data-filter") !== "all") {
          findings.setAttribute("data-filter", "all");
          window.dispatchEvent(new Event("flow:findings-filter-reset"));
        }
      }

      // A double-rAF used to gate this (to let the newly-unhidden panel finish
      // its layout pass first), but requestAnimationFrame can stall when the
      // tab isn't compositing frames; a setTimeout tick is enough for the
      // unhide to have taken effect.
      window.setTimeout(() => {
        const destination = document.getElementById(targetId);
        if (!destination) return;
        const card = destination.querySelector("details");
        if (card && !card.open) card.open = true;

        // scrollIntoView / smooth scroll are unreliable right after a large
        // panel is unhidden — compute the position and jump instead. The offset
        // matches the scroll-margin-top used for [id] elements on this page.
        const headerOffset = window.innerWidth >= 768 ? 220 : 180;
        const destinationTop =
          destination.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo(0, Math.max(0, destinationTop));
        if (updateUrl) window.history.replaceState(null, "", hash);
      }, 0);
      return true;
    },
    [applyTab],
  );

  useEffect(() => {
    // First load: honor a hash in the URL (emailed / bookmarked deep links).
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash && goToHash(hash, false)) return;
    applyTab(startTab, false);
  }, [applyTab, goToHash, startTab]);

  useEffect(() => {
    const nav = navRef.current;
    const parent = nav?.parentElement;
    if (!nav || !parent) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!anchor) return;

      const hash = anchor.getAttribute("href") || "";
      if (!tabForHash(hash)) return;

      event.preventDefault();
      goToHash(hash, true);
    }

    parent.addEventListener("click", handleClick);
    return () => parent.removeEventListener("click", handleClick);
  }, [goToHash]);

  const visibleTabs = TAB_LABELS.filter(({ key }) => {
    if (key === "summary") return showSummary;
    if (key === "disclaimers") return showDisclaimers;
    if (key === "standards") return showStandards;
    if (key === "equipment") return showEquipment;
    if (key === "priority") return showPriority;
    if (key === "maintenance") return showMaintenance;
    return true;
  });

  return (
    <div
      ref={navRef}
      className="sticky top-0 z-40 mt-8 border-y border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur print:hidden"
      aria-label="Report views"
    >
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {visibleTabs.map(({ key, label, tone }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => applyTab(key, false)}
              aria-pressed={active}
              data-fast-click="true"
              className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-semibold transition duration-100 active:scale-[0.98] [touch-action:manipulation] ${
                active
                  ? "border-teal-400 bg-teal-500 text-slate-950"
                  : `bg-[var(--fl-surface-2)] ${tone}`
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ShareTab = "summary" | "full" | "disclaimers" | "standards" | "equipment";

type Props = {
  initialTab?: ShareTab;
  showSummary?: boolean;
  showDisclaimers?: boolean;
  showStandards?: boolean;
  showEquipment?: boolean;
};

const TAB_LABELS: Array<{ key: ShareTab; label: string; tone: string }> = [
  { key: "summary", label: "Summary", tone: "border-teal-500 text-teal-300" },
  { key: "full", label: "Full Report", tone: "border-cyan-500 text-cyan-300" },
  { key: "disclaimers", label: "Disclaimers", tone: "border-purple-500 text-purple-300" },
  { key: "standards", label: "Standards", tone: "border-sky-500 text-sky-300" },
  { key: "equipment", label: "Equipment", tone: "border-emerald-500 text-emerald-300" },
];

function classifyPanel(element: HTMLElement): ShareTab {
  if (element.id === "client-summary") return "summary";
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
}: Props) {
  const [activeTab, setActiveTab] = useState<ShareTab>(initialTab);
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

  useEffect(() => {
    applyTab(initialTab, false);
  }, [applyTab, initialTab]);

  useEffect(() => {
    const nav = navRef.current;
    const parent = nav?.parentElement;
    if (!nav || !parent) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!anchor) return;

      const hash = anchor.getAttribute("href") || "";
      const targetTab: ShareTab | null =
        hash === "#client-summary"
          ? "summary"
          : hash === "#report-disclaimers"
            ? "disclaimers"
            : hash === "#standards-of-practice"
              ? "standards"
              : hash === "#equipment-inventory"
                ? "equipment"
                : hash === "#inspection-findings" ||
                    hash === "#report-limitations" ||
                    hash.startsWith("#section-")
                  ? "full"
                  : null;

      if (!targetTab) return;
      event.preventDefault();
      applyTab(targetTab, true);
    }

    parent.addEventListener("click", handleClick);
    return () => parent.removeEventListener("click", handleClick);
  }, [applyTab]);

  const visibleTabs = TAB_LABELS.filter(({ key }) => {
    if (key === "summary") return showSummary;
    if (key === "disclaimers") return showDisclaimers;
    if (key === "standards") return showStandards;
    if (key === "equipment") return showEquipment;
    return true;
  });

  return (
    <div
      ref={navRef}
      className="sticky top-0 z-40 mt-8 border-y border-slate-700 bg-[#0f172a]/95 px-3 py-3 backdrop-blur print:hidden"
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
              className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-black transition duration-100 active:scale-[0.98] [touch-action:manipulation] ${
                active
                  ? "border-teal-400 bg-teal-500 text-slate-950"
                  : `bg-[#071224] ${tone}`
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

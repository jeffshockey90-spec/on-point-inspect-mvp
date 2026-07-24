"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ReportBuilderTab = { key: string; label: string; anchorId: string };

// Groups admin/status sections (agreement, payment, disclaimers, etc.) behind
// a horizontal tab strip instead of a long vertical stack. Panels stay
// mounted (visibility toggled via the `hidden` attribute) so interactive
// children like AgreementSelector don't lose state when the tab isn't
// active. Modeled on components/ShareReportTabs.tsx, adapted to toggle by
// each panel's existing DOM id instead of scanning DOM siblings.
export default function ReportBuilderSectionTabs({
  tabs,
  children,
}: {
  tabs: ReportBuilderTab[];
  children: ReactNode;
}) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key || "");

  const applyTab = useCallback(
    (nextKey: string, scrollTo: boolean) => {
      tabs.forEach(({ key, anchorId }) => {
        const panel = document.getElementById(anchorId);
        if (!panel) return;
        panel.hidden = key !== nextKey;
        panel.setAttribute("aria-hidden", key === nextKey ? "false" : "true");
      });

      setActiveKey(nextKey);

      if (scrollTo) {
        const activeTab = tabs.find((tab) => tab.key === nextKey);

        if (activeTab) {
          window.setTimeout(() => {
            const destination = document.getElementById(activeTab.anchorId);
            if (!destination) return;

            const headerOffset = window.innerWidth >= 768 ? 220 : 180;
            const destinationTop =
              destination.getBoundingClientRect().top + window.scrollY - headerOffset;

            window.scrollTo(0, Math.max(0, destinationTop));
          }, 0);
        }
      }
    },
    [tabs]
  );

  const revealAnchor = useCallback(
    (anchorId: string) => {
      const tab = tabs.find((item) => item.anchorId === anchorId);
      if (!tab) return false;

      applyTab(tab.key, true);
      return true;
    },
    [tabs, applyTab]
  );

  useEffect(() => {
    applyTab(tabs[0]?.key || "", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (window as any).__revealReportBuilderTab = revealAnchor;

    return () => {
      if ((window as any).__revealReportBuilderTab === revealAnchor) {
        delete (window as any).__revealReportBuilderTab;
      }
    };
  }, [revealAnchor]);

  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) revealAnchor(hash);
    }

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!anchor) return;

      const hash = anchor.getAttribute("href")?.replace(/^#/, "") || "";
      if (!tabs.some((tab) => tab.anchorId === hash)) return;

      event.preventDefault();
      revealAnchor(hash);
      window.history.replaceState(null, "", `#${hash}`);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [tabs, revealAnchor]);

  return (
    <div className="mb-8">
      <div
        className="sticky top-0 z-40 border-y border-slate-700 bg-[#0f172a]/95 px-3 py-3 backdrop-blur"
        aria-label="Report sections"
      >
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {tabs.map(({ key, label }) => {
            const active = activeKey === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => applyTab(key, false)}
                aria-pressed={active}
                className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-black transition duration-100 active:scale-[0.98] [touch-action:manipulation] ${
                  active
                    ? "border-teal-400 bg-teal-500 text-slate-950"
                    : "border-slate-700 bg-[#071224] text-slate-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-6">{children}</div>
    </div>
  );
}

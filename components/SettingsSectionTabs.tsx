"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type SettingsTab = { key: string; label: string; anchorId: string };

// Same pattern as components/ReportBuilderSectionTabs.tsx: panels stay
// mounted (visibility toggled via the `hidden` attribute) so form state
// inside inactive tabs isn't lost, and the whole settings form still
// submits together regardless of which tab is showing.
export default function SettingsSectionTabs({
  tabs,
  children,
}: {
  tabs: SettingsTab[];
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

            const headerOffset = 96;
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
    function handleHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) revealAnchor(hash);
    }

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div
        className="sticky top-0 z-40 -mx-3 border-y border-[#232b38] bg-[#10151e]/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border"
        aria-label="Settings sections"
      >
        <div className="-mx-3 flex gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 pr-6 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:px-0">
          {tabs.map(({ key, label }) => {
            const active = activeKey === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => applyTab(key, false)}
                aria-pressed={active}
                className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-semibold transition duration-100 active:scale-[0.98] [touch-action:manipulation] ${
                  active
                    ? "border-teal-400 bg-teal-500 text-slate-950"
                    : "border-[#232b38] bg-[#071224] text-[#e8ecf3]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-6">{children}</div>
    </div>
  );
}

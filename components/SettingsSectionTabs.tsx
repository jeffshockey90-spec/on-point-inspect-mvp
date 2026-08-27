"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type SettingsTab = {
  key: string;
  label: string;
  anchorId: string;
  group?: string;
};

// Sectioned settings navigation. On desktop this renders a vertical left rail
// (grouped by category) beside the content — the same sub-navigation pattern
// the app uses elsewhere — and on mobile it falls back to a horizontal scroll
// strip. Panels stay mounted (visibility toggled via the `hidden` attribute)
// so form state inside inactive tabs isn't lost and the whole settings form
// still submits together regardless of which tab is showing.
export default function SettingsSectionTabs({
  tabs,
  children,
}: {
  tabs: SettingsTab[];
  children: ReactNode;
}) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key || "");

  // Group tabs by category, preserving first-appearance order of both the
  // groups and the tabs within them.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, SettingsTab[]>();
    tabs.forEach((tab) => {
      const name = tab.group || "";
      if (!byGroup.has(name)) {
        byGroup.set(name, []);
        order.push(name);
      }
      byGroup.get(name)!.push(tab);
    });
    return order.map((name) => ({ name, items: byGroup.get(name)! }));
  }, [tabs]);

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
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
      {/* Mobile / tablet: horizontal scroll strip */}
      <div
        className="sticky top-0 z-40 -mx-3 border-y border-[#232b38] bg-[#10151e]/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:hidden"
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
                    ? "border-[#1ac5b4] bg-[#1ac5b4] text-[#06120f]"
                    : "border-[#232b38] bg-[#131923] text-[#e8ecf3]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical left rail, grouped by category */}
      <nav className="hidden lg:block" aria-label="Settings sections">
        <div className="sticky top-20 space-y-6">
          {groups.map((group) => (
            <div key={group.name || "_"}>
              {group.name ? (
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#59626f]">
                  {group.name}
                </p>
              ) : null}
              <div className="mt-2 space-y-0.5">
                {group.items.map(({ key, label }) => {
                  const active = activeKey === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyTab(key, false)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        active
                          ? "bg-[#1ac5b4]/[0.12] text-white"
                          : "text-[#8a93a3] hover:bg-white/[0.04] hover:text-[#e8ecf3]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                          active ? "bg-[#1ac5b4]" : "bg-transparent"
                        }`}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="mt-5 space-y-6 lg:mt-0">{children}</div>
    </div>
  );
}

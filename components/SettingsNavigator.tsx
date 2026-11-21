"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

// Settings as one short grouped list (like iPhone Settings). Tapping a row
// either opens a separate settings page (href) or shows just that section of
// this page (anchorIds) with a "‹ Settings" back link.
//
// Panels stay MOUNTED and are only hidden, because most of them live inside one
// <form>: hiding (not unmounting) keeps every field submitting together, so
// saving one section never blanks another.

export type SettingsNavItem = {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  group: string;
  /** Element ids of the page sections this row shows. */
  anchorIds?: string[];
  /** Or: a separate settings page. */
  href?: string;
  badge?: string;
  /** Short status line shown instead of the description (e.g. Stripe connected). */
  status?: { text: string; tone: "good" | "warn" };
  danger?: boolean;
  /** Show the page's shared Save button while this section is open. */
  usesPageSave?: boolean;
};

const SAVE_AREA_ID = "settings-save";
const HEADER_ID = "settings-header";

function readSectionFromUrl(items: SettingsNavItem[]): string | null {
  try {
    const url = new URL(window.location.href);
    const section = url.searchParams.get("section");
    if (section && items.some((i) => i.key === section && i.anchorIds)) return section;
    const hash = url.hash.replace(/^#/, "");
    if (hash) {
      const byHash = items.find((i) => i.key === hash || i.anchorIds?.includes(hash));
      if (byHash?.anchorIds) return byHash.key;
    }
    // Coming back from Stripe onboarding lands on Payments.
    if (url.searchParams.has("stripe") || url.searchParams.has("stripe_error")) {
      if (items.some((i) => i.key === "payments")) return "payments";
    }
  } catch {}
  return null;
}

export default function SettingsNavigator({
  items,
  children,
}: {
  items: SettingsNavItem[];
  children: ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, SettingsNavItem[]>();
    for (const item of items) {
      if (!byGroup.has(item.group)) {
        byGroup.set(item.group, []);
        order.push(item.group);
      }
      byGroup.get(item.group)!.push(item);
    }
    return order.map((name) => ({ name, items: byGroup.get(name)! }));
  }, [items]);

  // Show only the active item's panels (and the shared Save when it uses it).
  const applyVisibility = useCallback(
    (key: string | null) => {
      const activeItem = items.find((i) => i.key === key) || null;
      const shown = new Set(activeItem?.anchorIds || []);
      for (const item of items) {
        for (const id of item.anchorIds || []) {
          const el = document.getElementById(id);
          if (!el) continue;
          el.hidden = !shown.has(id);
        }
      }
      const save = document.getElementById(SAVE_AREA_ID);
      if (save) save.hidden = !activeItem?.usesPageSave;
      // The page's big title card belongs to the list, not to an open section
      // (each section has its own heading).
      const header = document.getElementById(HEADER_ID);
      if (header) header.hidden = Boolean(activeItem);
    },
    [items],
  );

  useEffect(() => {
    const initial = readSectionFromUrl(items);
    setActive(initial);
    applyVisibility(initial);
    setReady(true);

    function onPop() {
      const key = readSectionFromUrl(items);
      setActive(key);
      applyVisibility(key);
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, [items, applyVisibility]);

  function open(key: string) {
    setActive(key);
    applyVisibility(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("section", key);
      url.hash = "";
      // A history entry, so the phone's back gesture returns to the list.
      window.history.pushState(null, "", url.toString());
    } catch {}
    window.scrollTo(0, 0);
  }

  function back() {
    setActive(null);
    applyVisibility(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("section");
      url.hash = "";
      window.history.replaceState(null, "", url.toString());
    } catch {}
    window.scrollTo(0, 0);
  }

  const activeItem = items.find((i) => i.key === active) || null;

  const rowBase =
    "flex w-full min-w-0 items-center gap-3 border-t border-[var(--fl-line)] px-3 py-3 text-left transition-colors first:border-t-0 hover:bg-white/[0.03] [touch-action:manipulation] sm:px-4";

  function RowInner({ item }: { item: SettingsNavItem }) {
    return (
      <>
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]"
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`flex items-center gap-2 text-[15px] font-semibold ${
              item.danger ? "text-[var(--fl-crit-text)]" : "text-[var(--fl-text)]"
            }`}
          >
            {item.label}
            {item.badge ? (
              <span className="rounded-full border border-amber-400/40 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[var(--fl-warn-text)]">
                {item.badge}
              </span>
            ) : null}
          </span>
          {item.status ? (
            <span
              className={`block truncate text-xs font-semibold ${
                item.status.tone === "good" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-warn-text)]"
              }`}
            >
              {item.status.text}
            </span>
          ) : item.description ? (
            <span className="block truncate text-xs text-[var(--fl-muted)]">{item.description}</span>
          ) : null}
        </span>
        <span aria-hidden className="shrink-0 text-lg text-[var(--fl-faint)]">
          ›
        </span>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* The list (hidden while a section is open). */}
      <div hidden={Boolean(activeItem)} className="space-y-5">
        {groups.map((group) => (
          <div key={group.name}>
            {group.name ? (
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-faint)]">
                {group.name}
              </p>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)]">
              {group.items.map((item) =>
                item.href ? (
                  <Link key={item.key} href={item.href} className={rowBase}>
                    <RowInner item={item} />
                  </Link>
                ) : (
                  <button key={item.key} type="button" onClick={() => open(item.key)} className={rowBase}>
                    <RowInner item={item} />
                  </button>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      {/* One section, with a way back to the list. */}
      {activeItem ? (
        <div className="mb-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 text-[15px] font-semibold text-[var(--fl-accent-text)] [touch-action:manipulation]"
          >
            ‹ Settings
          </button>
        </div>
      ) : null}

      {/* Panels stay mounted; until the URL is read, keep them out of view. */}
      <div className={`space-y-6 ${ready && activeItem ? "" : "hidden"}`}>{children}</div>
    </div>
  );
}

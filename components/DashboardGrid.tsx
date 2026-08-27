"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LAYOUT,
  WIDGET_TITLES,
  nextSize,
  sizeColSpanClass,
  type DashboardLayout,
  type WidgetSize,
} from "../lib/dashboard/dashboardLayout";

type Props = {
  widgets: { id: string; node: ReactNode }[];
  initialLayout: DashboardLayout;
};

const SIZE_LABEL: Record<WidgetSize, string> = { full: "Full", half: "½", third: "⅓" };

export default function DashboardGrid({ widgets, initialLayout }: Props) {
  const nodeById = useMemo(() => new Map(widgets.map((w) => [w.id, w.node])), [widgets]);
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Only render widgets we actually have a node for (self-heals if a widget id
  // is retired). Hidden widgets are offered in the "Add widget" menu.
  const known = layout.filter((w) => nodeById.has(w.id));
  const visible = known.filter((w) => w.visible);
  const hidden = known.filter((w) => !w.visible);

  function persist(next: DashboardLayout) {
    // Fire-and-forget — the UI already reflects the change.
    void fetch("/api/settings/dashboard-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: next }),
    }).catch(() => {});
  }
  function apply(next: DashboardLayout) {
    setLayout(next);
    persist(next);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = layout.findIndex((w) => w.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[idx], next[j]] = [next[j], next[idx]];
    apply(next);
  }
  function reorderTo(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = layout.findIndex((w) => w.id === dragId);
    const to = layout.findIndex((w) => w.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...layout];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    apply(next);
  }
  function cycleSize(id: string) {
    apply(layout.map((w) => (w.id === id ? { ...w, size: nextSize(w.size) } : w)));
  }
  function setVisible(id: string, v: boolean) {
    apply(layout.map((w) => (w.id === id ? { ...w, visible: v } : w)));
  }
  function reset() {
    if (!window.confirm("Reset your dashboard layout to the default?")) return;
    setLayout(DEFAULT_LAYOUT);
    void fetch("/api/settings/dashboard-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && hidden.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAdd((s) => !s)}
              className="rounded-xl border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-text)] hover:border-teal-400 hover:bg-teal-500/10"
            >
              + Add widget
            </button>
            {showAdd && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-1 shadow-2xl">
                {hidden.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setVisible(w.id, true);
                      setShowAdd(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--fl-text)] hover:bg-teal-500/10 hover:text-[var(--fl-accent-text)]"
                  >
                    {WIDGET_TITLES[w.id] || w.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {editing && (
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-muted)] hover:border-red-500 hover:text-[var(--fl-crit-text)]"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setEditing((e) => !e);
            setShowAdd(false);
          }}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
            editing
              ? "bg-teal-500 text-slate-950 hover:bg-teal-400"
              : "border border-[var(--fl-line)] text-[var(--fl-text)] hover:border-teal-400 hover:bg-teal-500/10"
          }`}
        >
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      {editing && (
        <p className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs text-[var(--fl-muted)]">
          Drag the ⠿ handle to reorder, tap the size button to step width (Full → ½ → ⅓), and hide/show
          widgets. Your layout saves automatically and follows you to every device.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {visible.map((w) => (
          <section
            key={w.id}
            className={`${sizeColSpanClass(w.size)} ${editing ? "relative rounded-2xl ring-1 ring-slate-700/70" : ""} ${
              dragId === w.id ? "opacity-50 ring-2 ring-teal-400" : ""
            }`}
            onDragOver={editing ? (e) => e.preventDefault() : undefined}
            onDrop={editing ? () => reorderTo(w.id) : undefined}
          >
            {editing && (
              <div className="absolute -top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface)] px-2 py-1 shadow-lg">
                <span
                  draggable
                  onDragStart={() => setDragId(w.id)}
                  onDragEnd={() => setDragId(null)}
                  className="cursor-grab select-none px-1 text-[var(--fl-muted)] active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  ⠿
                </span>
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  {WIDGET_TITLES[w.id] || w.id}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => move(w.id, -1)} className="px-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)]" title="Move up">▲</button>
                  <button type="button" onClick={() => move(w.id, 1)} className="px-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)]" title="Move down">▼</button>
                  <button
                    type="button"
                    onClick={() => cycleSize(w.id)}
                    className="rounded-md bg-[var(--fl-raised)] px-2 py-0.5 text-[11px] font-semibold text-[var(--fl-accent-text)] hover:bg-[var(--fl-raised)]"
                    title="Resize"
                  >
                    {SIZE_LABEL[w.size]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisible(w.id, false)}
                    className="px-1 text-[var(--fl-muted)] hover:text-[var(--fl-crit-text)]"
                    title="Hide widget"
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}
            <div className={editing ? "pointer-events-none pt-3 opacity-95" : ""}>{nodeById.get(w.id)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

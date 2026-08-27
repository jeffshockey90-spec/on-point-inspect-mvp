"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Step = { key: string; label: string; done: boolean; href: string };

const DISMISS_KEY = "flow-setup-checklist-dismissed";

// Compact dashboard activation checklist (Hive-style). Fetches setup progress,
// shows step chips with a progress bar, and auto-hides once every step is done
// or the user dismisses it. Renders nothing on the server / first paint so
// there's no layout flash or hydration mismatch.
export default function SetupChecklist() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    fetch("/api/onboarding-status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.steps)) setSteps(data.steps);
      })
      .catch(() => {});
  }, []);

  if (!steps || dismissed) return null;

  const done = steps.filter((step) => step.done).length;
  if (done >= steps.length) return null;

  const pct = Math.round((done / steps.length) * 100);

  return (
    <section className="rounded-xl border border-[#1ac5b4]/25 bg-[var(--fl-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
            Get set up
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
            Finish setting up FLOW
          </h2>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            {done} of {steps.length} done
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-muted)] transition hover:border-[var(--fl-faint)] hover:text-[var(--fl-text)]"
        >
          Dismiss
        </button>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--fl-raised)]">
        <div
          className="h-full rounded-full bg-[#1ac5b4] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={`flex items-center gap-3 rounded-xl border p-3 transition ${
              step.done
                ? "border-[#37d6a6]/30 bg-[#37d6a6]/5"
                : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] hover:border-[#1ac5b4]/50"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step.done
                  ? "bg-[#37d6a6] text-[#06120f]"
                  : "border border-[var(--fl-line)] text-[var(--fl-faint)]"
              }`}
            >
              {step.done ? "✓" : ""}
            </span>
            <span
              className={`text-sm font-semibold ${
                step.done ? "text-[var(--fl-faint)] line-through" : "text-[var(--fl-text)]"
              }`}
            >
              {step.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

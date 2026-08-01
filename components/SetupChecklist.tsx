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
    <section className="rounded-3xl border border-teal-500/30 bg-gradient-to-br from-[#0b1220] to-[#071827] p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-300">
            Get set up
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Finish setting up FLOW
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {done} of {steps.length} done
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
        >
          Dismiss
        </button>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-teal-400 transition-all"
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
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-slate-700 bg-[#020617]/70 hover:border-teal-400/60"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                step.done
                  ? "bg-emerald-500 text-slate-950"
                  : "border border-slate-600 text-slate-500"
              }`}
            >
              {step.done ? "✓" : ""}
            </span>
            <span
              className={`text-sm font-bold ${
                step.done ? "text-slate-500 line-through" : "text-white"
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

"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type TourStep = {
  target: string;
  title: string;
  body: string;
  placement: "top" | "bottom";
};

const STORAGE_KEY = "flow_dashboard_tour_v1_dismissed";

async function persistDismissed() {
  try {
    await fetch("/api/dashboard-tour/dismiss", { method: "POST" });
  } catch {}
}

const STEPS: TourStep[] = [
  {
    target: "tour-new-inspection",
    title: "Start an Inspection",
    body: "This is the fastest way in - kick off a brand new inspection from any page.",
    placement: "bottom",
  },
  {
    target: "tour-field-tool",
    title: "Field Tool",
    body: "Open the mobile AI workflow to capture findings, photos, and equipment while you're walking the property.",
    placement: "bottom",
  },
  {
    target: "tour-schedule",
    title: "Schedule",
    body: "See upcoming inspections and manage the availability clients and realtors can book online.",
    placement: "bottom",
  },
  {
    target: "tour-metrics",
    title: "Today at a Glance",
    body: "Today's inspections, draft reports, unpaid balances, and repair requests waiting on a response - all live.",
    placement: "bottom",
  },
  {
    target: "tour-getting-started",
    title: "Getting Started Guide",
    body: "Come back here any time for a step-by-step setup checklist - pricing, availability, agreements, and your public profile.",
    placement: "top",
  },
];

function readDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}

export default function DashboardTour({
  initialDismissed = false,
}: {
  initialDismissed?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setReady(true);
    if (!initialDismissed && !readDismissed()) {
      setStepIndex(0);
    }
  }, [initialDismissed]);

  const step = stepIndex >= 0 ? STEPS[stepIndex] : null;

  const measure = useCallback(() => {
    if (!step) {
      setRect(null);
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!step) return;

    const el = document.querySelector(`[data-tour="${step.target}"]`);

    if (!el) {
      setStepIndex((current) =>
        current + 1 < STEPS.length ? current + 1 : -1,
      );
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const settleTimer = setTimeout(measure, 260);

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  function finishTour() {
    writeDismissed();
    persistDismissed();
    setStepIndex(-1);
  }

  function nextStep() {
    if (stepIndex + 1 >= STEPS.length) {
      finishTour();
      return;
    }
    setStepIndex(stepIndex + 1);
  }

  function previousStep() {
    if (stepIndex <= 0) return;
    setStepIndex(stepIndex - 1);
  }

  function restartTour() {
    setStepIndex(0);
  }

  if (!ready) return null;

  if (!step || !rect) {
    if (step) return null;

    return (
      <button
        type="button"
        onClick={restartTour}
        className="fixed bottom-24 right-4 z-[150] flex items-center gap-2 rounded-full border border-teal-500/50 bg-[#0b1220] px-4 py-3 text-xs font-black uppercase tracking-wide text-teal-300 shadow-2xl shadow-black/40 transition hover:border-teal-300 hover:text-teal-200 active:scale-[0.97] xl:bottom-6"
      >
        🧭 Take the Tour
      </button>
    );
  }

  const padding = 8;
  const boxTop = rect.top - padding;
  const boxLeft = rect.left - padding;
  const boxWidth = rect.width + padding * 2;
  const boxHeight = rect.height + padding * 2;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.min(340, viewportWidth - 32);
  const tooltipLeft = Math.min(Math.max(boxLeft, 16), viewportWidth - tooltipWidth - 16);

  const style: CSSProperties =
    step.placement === "top"
      ? { bottom: Math.max(viewportHeight - boxTop + 14, 16), left: tooltipLeft }
      : { top: Math.min(boxTop + boxHeight + 14, viewportHeight - 220), left: tooltipLeft };

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Dashboard tour">
      <div
        className="pointer-events-none absolute rounded-2xl border-2 border-teal-400 transition-all duration-300"
        style={{
          top: boxTop,
          left: boxLeft,
          width: boxWidth,
          height: boxHeight,
          boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.78)",
        }}
      />

      <div
        className="absolute z-[201] rounded-2xl border border-teal-500/40 bg-[#0b1220] p-5 shadow-2xl shadow-black/40"
        style={{ ...style, width: tooltipWidth }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-300">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <h3 className="mt-2 text-lg font-black text-white">{step.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finishTour}
            className="text-xs font-black uppercase tracking-wide text-slate-500 transition hover:text-slate-300"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={previousStep}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-teal-400"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={nextStep}
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-teal-400"
            >
              {stepIndex + 1 >= STEPS.length ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import CreateSampleDataButton from "./CreateSampleDataButton";

type OnboardingChecklistProps = {
  inspectionCount?: number;
  draftReportCount?: number;
  publishedReportCount?: number;
  companyProfileReady?: boolean;
  hasOfficeAddress?: boolean;
  agreementSetupReady?: boolean;
};

type Step = {
  title: string;
  description: string;
  href: string;
  action: string;
  complete: boolean;
  icon: string;
};

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <Link
      href={step.href}
      className={`group block rounded-2xl border p-5 shadow-xl transition active:scale-[0.99] ${
        step.complete
          ? "border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-400"
          : "border-slate-800 bg-[#0b1220] hover:border-teal-400 hover:bg-[#13213a]"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${
            step.complete ? "bg-emerald-500/15" : "bg-teal-500/10"
          }`}
        >
          {step.complete ? "✅" : step.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-[#020617] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
              Step {index + 1}
            </span>

            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                step.complete
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-yellow-500/50 bg-yellow-500/10 text-yellow-200"
              }`}
            >
              {step.complete ? "Complete" : "Next"}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-black text-white group-hover:text-teal-300">
            {step.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            {step.description}
          </p>

          <p className="mt-4 text-sm font-black text-teal-300">
            {step.action} →
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function OnboardingChecklist({
  inspectionCount = 0,
  draftReportCount = 0,
  publishedReportCount = 0,
  companyProfileReady = false,
  hasOfficeAddress = false,
  agreementSetupReady = false,
}: OnboardingChecklistProps) {
  const hasAnyInspection = inspectionCount > 0;
  const hasSectionContent = draftReportCount > 0 || publishedReportCount > 0;

  const steps: Step[] = [
    {
      title: "Company Info & Address",
      description:
        "Add your logo, contact info, brand settings, and business starting address so reports and mileage tracking are ready.",
      href: "/settings",
      action: "Open Settings",
      complete: companyProfileReady && hasOfficeAddress,
      icon: "🏢",
    },
    {
      title: "Agreements & Standards of Practice",
      description:
        "Set up your agreement templates and customize your Standards of Practice so every report is ready to send.",
      href: "/agreements",
      action: "Set Up Agreements",
      complete: agreementSetupReady,
      icon: "📝",
    },
    {
      title: "Schedule an Inspection",
      description:
        "Create your first inspection with a date, time, and property address - or load sample data to try the workflow.",
      href: hasAnyInspection ? "/reports" : "/inspections/new",
      action: hasAnyInspection ? "View Reports" : "Create Inspection",
      complete: hasAnyInspection,
      icon: "🗓️",
    },
    {
      title: "Inspection Section Info",
      description:
        "Open the inspection and fill in section details - exterior, roof, systems, and everything in between.",
      href: "/reports",
      action: "Open Reports",
      complete: hasSectionContent,
      icon: "🏠",
    },
    {
      title: "Field Tool",
      description:
        "Capture photos, dictate findings, and use AI assistance to build your report directly from the field.",
      href: "/field",
      action: "Open Field Tool",
      complete: hasSectionContent,
      icon: "📱",
    },
  ];

  const completeCount = steps.filter((step) => step.complete).length;
  const progress = Math.round((completeCount / steps.length) * 100);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-teal-500/30 bg-gradient-to-br from-[#0b1220] via-[#071827] to-[#020617] p-6 shadow-2xl shadow-teal-950/30 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-300">
              Getting Started
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-6xl">
              Set up FLOW
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
              Five steps to a complete inspection workflow: company info, agreements and
              standards, scheduling, section content, and the Field Tool.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/inspections/new"
                className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
              >
                + New Inspection
              </Link>

              <Link
                href="/field"
                className="rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20 active:scale-[0.98]"
              >
                📱 Open Field Tool
              </Link>

              <CreateSampleDataButton />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-[#020617]/70 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Setup Progress
            </p>

            <p className="mt-3 text-5xl font-black text-white">
              {progress}%
            </p>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-900 ring-1 ring-slate-700">
              <div
                className="h-full rounded-full bg-teal-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-400">
              {completeCount} of {steps.length} setup milestones complete.
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        {steps.map((step, index) => (
          <StepCard key={step.title} step={step} index={index} />
        ))}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-300">
          First Inspection Walkthrough
        </p>

        <h2 className="mt-2 text-3xl font-black text-white">
          Recommended test drive
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {[
            ["1", "Create sample inspection", "Use the sample button to load a realistic job."],
            ["2", "Open the report", "Review findings, photos, payment, and agreements."],
            ["3", "Run AI review", "Use the AI Report Review and publish guard."],
            ["4", "Try delivery", "Open share/report links and repair request tools."],
          ].map(([number, title, helper]) => (
            <div
              key={number}
              className="rounded-2xl border border-slate-700 bg-[#020617]/80 p-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/15 text-lg font-black text-purple-200">
                {number}
              </div>
              <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{helper}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

"use client";

import Link from "next/link";
import CreateSampleDataButton from "./CreateSampleDataButton";

type OnboardingChecklistProps = {
  inspectionCount?: number;
  sampleInspectionCount?: number;
  draftReportCount?: number;
  publishedReportCount?: number;
  agreementCount?: number;
  paidReportCount?: number;
  companyProfileReady?: boolean;
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
  sampleInspectionCount = 0,
  draftReportCount = 0,
  publishedReportCount = 0,
  agreementCount = 0,
  paidReportCount = 0,
  companyProfileReady = false,
}: OnboardingChecklistProps) {
  const hasRealInspection = inspectionCount > sampleInspectionCount;
  const hasAnyInspection = inspectionCount > 0;

  const steps: Step[] = [
    {
      title: "Finish your company setup",
      description:
        "Add your logo, public profile details, contact information, and brand settings so reports look complete.",
      href: "/settings",
      action: "Open Settings",
      complete: companyProfileReady,
      icon: "🏢",
    },
    {
      title: "Create or load an inspection",
      description:
        "Start a real inspection, or create sample data so you can test the workflow without using a client job.",
      href: hasAnyInspection ? "/reports" : "/inspections/new",
      action: hasAnyInspection ? "View Reports" : "Create Inspection",
      complete: hasRealInspection || sampleInspectionCount > 0,
      icon: "🏠",
    },
    {
      title: "Use the Field Tool",
      description:
        "Capture photos, dictate findings, use AI assistance, and build report content from the field.",
      href: "/field",
      action: "Open Field Tool",
      complete: draftReportCount > 0 || publishedReportCount > 0,
      icon: "📱",
    },
    {
      title: "Send agreements",
      description:
        "Use agreement templates, required signer tracking, and reminders before final delivery.",
      href: "/agreements",
      action: "Review Agreements",
      complete: agreementCount > 0,
      icon: "📝",
    },
    {
      title: "Confirm payment",
      description:
        "Use invoice and payment status tracking so delivery requirements are clear before publishing.",
      href: "/invoices",
      action: "Open Invoices",
      complete: paidReportCount > 0,
      icon: "💰",
    },
    {
      title: "Publish and deliver",
      description:
        "Run AI review, check the publish guard, publish the report, and send client/realtor delivery links.",
      href: "/reports",
      action: "Open Reports",
      complete: publishedReportCount > 0,
      icon: "🚀",
    },
    {
      title: "Try repair requests",
      description:
        "Build a repair request, send a secure response link, and collect seller responses/credits.",
      href: "/reports",
      action: "Open a Report",
      complete: false,
      icon: "🛠️",
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
              Set up On Point Inspect
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
              Follow this checklist to go from a blank account to a complete inspection workflow:
              company setup, sample inspection, Field Tool, agreements, payment, publishing,
              and repair requests.
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

      <section className="rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-6 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
          Help Videos
        </p>

        <h2 className="mt-2 text-3xl font-black text-white">
          Training library placeholder
        </h2>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-yellow-100">
          Add short Loom/YouTube links here later for “Create First Inspection,”
          “Use Field Tool,” “Send Agreements,” “Publish Report,” and “Repair Requests.”
          The layout is ready; the videos can be dropped in when recorded.
        </p>
      </section>
    </section>
  );
}

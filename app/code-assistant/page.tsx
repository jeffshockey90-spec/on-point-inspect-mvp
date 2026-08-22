"use client";

import Link from "next/link";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import CodeAssistantPanel from "../../components/CodeAssistantPanel";

export default function CodeAssistantPage() {
  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-black text-slate-400 transition hover:text-teal-300"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Dashboard
          </Link>
        </div>

        <header className="overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-br from-[#0b1220] via-[#071827] to-[#020617] p-6 shadow-2xl shadow-teal-950/30 md:p-8">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.35em] text-[#14c8d2]">
            <BookOpenCheck className="h-4 w-4" strokeWidth={2.5} /> Code Assistant
          </p>
          <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
            Ask a building-code question
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Handrail heights, guard heights, GFCI/AFCI locations, TPR valves,
            egress sizing, and more — in plain language, referencing general model
            (IRC) context. Every answer reminds you to confirm the specifics with
            the local authority having jurisdiction.
          </p>
        </header>

        <CodeAssistantPanel />
      </div>
    </main>
  );
}

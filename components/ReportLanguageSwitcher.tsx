"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Languages } from "lucide-react";

type Lang = { code: string; label: string };

// Client-report language selector. Changing it sets ?lang= and reloads; the
// server re-renders the report translated (cached after the first time).
export default function ReportLanguageSwitcher({
  languages,
  current,
}: {
  languages: Lang[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(current || "en");

  const labelFor = (code: string) =>
    code === "en" ? "English" : languages.find((l) => l.code === code)?.label || code;
  const pendingLabel = labelFor(value);

  function change(code: string) {
    setValue(code);
    const next = new URLSearchParams(params?.toString() || "");
    // Always set the param (including "en") so an explicit English choice is
    // respected even when the company's default report language isn't English.
    next.set("lang", code);
    const qs = next.toString();
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      router.refresh();
    });
  }

  return (
    <label className="inline-flex w-full items-center gap-3 rounded-xl border-2 border-teal-500/60 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-100 shadow-sm sm:w-auto print:hidden">
      <Languages className="h-5 w-5 shrink-0 text-teal-300" />
      <span className="whitespace-nowrap">
        Language <span className="text-teal-300/80">· Idioma · 语言</span>
      </span>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        aria-label="Choose report language"
        className="ml-auto rounded-lg border border-teal-500/40 bg-[#071224] px-3 py-1.5 text-sm font-black text-white focus:border-teal-300 focus:outline-none disabled:opacity-50"
      >
        <option value="en">English</option>
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs font-bold text-teal-300/80">…</span>}

      {pending && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#020617]/80 backdrop-blur-sm print:hidden">
          <div className="mx-4 max-w-sm rounded-2xl border border-teal-500/50 bg-[#0f172a] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-400" />
            <p className="text-base font-black text-white">
              Preparing your report in {pendingLabel}…
            </p>
            <p className="mt-2 text-sm text-slate-400">
              The first time a report is translated can take a few seconds. After that it&apos;s
              instant.
            </p>
          </div>
        </div>
      )}
    </label>
  );
}

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

  function change(code: string) {
    setValue(code);
    const next = new URLSearchParams(params?.toString() || "");
    if (code === "en") next.delete("lang");
    else next.set("lang", code);
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
    </label>
  );
}

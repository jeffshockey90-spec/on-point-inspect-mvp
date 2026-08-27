"use client";

// Report-builder control to switch which template a report uses. Applying a
// template snapshots its section list onto the inspection (never deletes
// findings — any that fall outside the new sections just move to "Other"). The
// AI camera / field tool pick up the change automatically. Hidden when the
// company has no templates.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshKeepScroll } from "../lib/refreshKeepScroll";

type T = { id: string; name: string };

export default function ReportTemplateSwitcher({
  inspectionId,
  currentTemplateId,
}: {
  inspectionId: string;
  currentTemplateId: string | null;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<T[]>([]);
  const [value, setValue] = useState(currentTemplateId || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/report-templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d?.templates) ? d.templates.map((t: any) => ({ id: t.id, name: t.name })) : []))
      .catch(() => {});
  }, []);

  if (templates.length === 0) return null;

  async function apply(next: string) {
    setBusy(true);
    setValue(next);
    await fetch("/api/report-templates/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId, templateId: next || null }),
    }).catch(() => {});
    setBusy(false);
    refreshKeepScroll(router);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#1a212c] bg-[#10151e] px-3 py-2.5">
      <span className="fl-lbl">Template</span>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => apply(e.target.value)}
        className="rounded-lg border border-[#232b38] bg-[#0a0e13] px-3 py-1.5 text-sm font-bold text-white outline-none focus:border-teal-400 disabled:opacity-60"
      >
        <option value="">Standard sections</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {busy && <span className="text-xs text-[#8a93a3]">Applying…</span>}
      <span className="ml-auto text-xs text-[#59626f]">Switching never deletes findings.</span>
    </div>
  );
}

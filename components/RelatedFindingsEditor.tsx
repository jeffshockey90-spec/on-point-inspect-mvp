"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshKeepScroll } from "../lib/refreshKeepScroll";

type Finding = {
  id: any;
  title?: string | null;
  section?: string | null;
  related_finding_ids?: any[] | null;
  related_note?: string | null;
};

// Link a finding to other findings you believe are related (e.g. an exterior gap
// and interior cracks -> possible structural movement), with an AI-drafted,
// client-friendly "related observations" note that the inspector can steer/edit.
export default function RelatedFindingsEditor({
  inspectionId,
  finding,
  allFindings,
}: {
  inspectionId: string;
  finding: Finding;
  allFindings: Finding[];
}) {
  const router = useRouter();
  const findingId = String(finding?.id || "");

  const initialRelated = Array.isArray(finding?.related_finding_ids)
    ? finding.related_finding_ids.map((x: any) => String(x)).filter(Boolean)
    : [];

  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialRelated);
  const [note, setNote] = useState(String(finding?.related_note || ""));
  const [aiHint, setAiHint] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const others = useMemo(
    () => (allFindings || []).filter((f) => String(f.id) !== findingId),
    [allFindings, findingId],
  );

  const byId = useMemo(() => {
    const map = new Map<string, Finding>();
    (allFindings || []).forEach((f) => map.set(String(f.id), f));
    return map;
  }, [allFindings]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function draftWithAi() {
    if (aiBusy || selectedIds.length < 1) return;
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/link-findings-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          findingIds: [findingId, ...selectedIds],
          hint: aiHint,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.note) throw new Error(data.error || "AI drafting failed.");
      setNote(data.note);
    } catch (e: any) {
      setError(e?.message || "AI drafting failed.");
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/findings/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          findingId,
          relatedIds: selectedIds,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save links.");
      setSaving(false);
      setOpen(false);
      refreshKeepScroll(router);
    } catch (e: any) {
      setError(e?.message || "Could not save links.");
      setSaving(false);
    }
  }

  const linkedChips = initialRelated
    .map((id) => byId.get(id))
    .filter(Boolean) as Finding[];

  return (
    <div className="mb-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-purple-text)]">
            🔗 Related Findings
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
            Link findings you believe share a cause. The AI writes a client-friendly note so the
            report shows they may be related.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-indigo-500/50 px-3 py-1.5 text-xs font-semibold text-[var(--fl-purple-text)] transition hover:bg-indigo-500/10"
        >
          {open ? "Done" : linkedChips.length > 0 ? "Edit links" : "Link findings"}
        </button>
      </div>

      {!open && linkedChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {linkedChips.map((f) => (
            <span
              key={String(f.id)}
              className="inline-flex max-w-full items-center rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-[var(--fl-purple-text)]"
            >
              <span className="truncate">{f.title || "Finding"}</span>
            </span>
          ))}
        </div>
      )}

      {!open && linkedChips.length > 0 && finding.related_note && (
        <p className="mt-2 text-xs leading-5 text-[var(--fl-muted)]">{finding.related_note}</p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {others.length === 0 ? (
            <p className="text-xs text-[var(--fl-muted)]">No other findings to link yet.</p>
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-2">
              {others.map((f) => {
                const id = String(f.id);
                const checked = selectedIds.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition ${
                      checked ? "bg-indigo-500/10" : "hover:bg-[var(--fl-raised)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-400"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--fl-text)]">
                        {f.title || "Untitled finding"}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--fl-muted)]">
                        {f.section || "—"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
              Related observations note (shown to the client)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Explain how these findings may be related, or draft it with AI below."
              className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-2 text-sm text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-indigo-400"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={aiHint}
              onChange={(e) => setAiHint(e.target.value)}
              placeholder="Tell AI how to word it (e.g. 'possible east-side settlement, stay non-alarming')"
              className="min-w-0 flex-1 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={draftWithAi}
              disabled={aiBusy || selectedIds.length < 1}
              className="rounded-lg border border-indigo-500/60 px-4 py-2 text-sm font-semibold text-[var(--fl-purple-text)] transition hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiBusy ? "Drafting…" : note ? "Redraft with AI" : "Draft with AI"}
            </button>
          </div>

          {error && <p className="text-xs font-bold text-[var(--fl-crit-text)]">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save links"}
          </button>
        </div>
      )}
    </div>
  );
}

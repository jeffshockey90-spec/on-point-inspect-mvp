"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

type Candidate = {
  id: number | string;
  title: string | null;
  section: string | null;
  severity: string | null;
};

const RESPONSE_LABEL: Record<string, string> = {
  repaired: "Seller: repaired",
  completed: "Seller: repaired",
  credit: "Seller: credit offered",
  declined: "Seller: declined",
};

/**
 * Starts a Limited Repair Re-Inspection.
 *
 * A repair re-inspection verifies the items the client asked to have re-checked
 * -- normally the repair request list -- not the whole report. So this opens a
 * picker pre-selected from the most recent repair request rather than copying
 * every finding: a report listing items that were never looked at on the return
 * visit misrepresents what was inspected. Nothing is created until the selection
 * is confirmed, so backing out leaves no stray report behind.
 */
export default function CreateReinspectionButton({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/inspections/reinspection?inspectionId=${inspectionId}&candidates=1`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load findings.");

      setCandidates(data.findings || []);
      setResponses(data.sellerResponses || {});

      const preset: Record<string, boolean> = {};
      for (const id of data.preselectedIds || []) preset[String(id)] = true;
      setSelected(preset);
    } catch (e: any) {
      setError(e?.message || "Could not load findings.");
    } finally {
      setLoading(false);
    }
  }

  const chosen = Object.keys(selected).filter((id) => selected[id]);

  async function create() {
    if (!chosen.length) {
      setError("Select at least one item to re-inspect.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inspections/reinspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: Number(inspectionId), findingIds: chosen }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.id) throw new Error(data?.error || "Could not create re-inspection.");
      router.push(`/reports/${data.id}`);
    } catch (e: any) {
      setError(e?.message || "Could not create re-inspection.");
      setBusy(false);
    }
  }

  const preselectedCount = Object.keys(responses).length;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition hover:border-teal-400 hover:bg-teal-500/10 hover:text-[var(--fl-accent-text)]"
      >
        <RotateCcw className="h-4 w-4" />
        Re-inspection
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] sm:rounded-2xl">
            <div className="border-b border-[var(--fl-line)] p-5">
              <h2 className="text-xl font-bold text-[var(--fl-text)]">
                What are you re-inspecting?
              </h2>
              <p className="mt-1 text-sm text-[var(--fl-muted)]">
                {preselectedCount
                  ? "Pre-selected from the repair request. Adjust if the seller addressed more or fewer items."
                  : "No repair request on file for this report — choose the items you went back to check."}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {error ? (
                <p className="mb-3 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-[var(--fl-crit-text)]">
                  {error}
                </p>
              ) : null}

              {loading ? (
                <p className="text-sm text-[var(--fl-muted)]">Loading findings…</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-[var(--fl-muted)]">This report has no findings.</p>
              ) : (
                <div className="space-y-2">
                  {candidates.map((f) => {
                    const key = String(f.id);
                    const response = responses[key];
                    const label = response
                      ? RESPONSE_LABEL[String(response.response_status || "").toLowerCase()] ||
                        `Seller: ${response.response_status}`
                      : "";
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selected[key])}
                          onChange={(e) =>
                            setSelected((prev) => ({ ...prev, [key]: e.target.checked }))
                          }
                          className="mt-1 h-4 w-4 accent-teal-500"
                        />
                        <span className="min-w-0">
                          <span className="block font-bold text-[var(--fl-text)]">
                            {f.title || "Finding"}
                          </span>
                          <span className="block text-xs text-[var(--fl-muted)]">
                            {f.section || "General"}
                            {f.severity ? ` · ${f.severity}` : ""}
                          </span>
                          {label ? (
                            <span className="mt-1 inline-block rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                              {label}
                            </span>
                          ) : null}
                          {response?.notes ? (
                            <span className="mt-1 block text-xs text-[var(--fl-muted)]">
                              {response.notes}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--fl-line)] p-5">
              <span className="text-sm text-[var(--fl-muted)]">
                {chosen.length} item{chosen.length === 1 ? "" : "s"} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-xl border border-[var(--fl-line)] px-4 py-2.5 font-semibold text-[var(--fl-muted)] transition hover:text-[var(--fl-text)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={busy || loading || !chosen.length}
                  className="rounded-xl bg-teal-500 px-4 py-2.5 font-bold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Start Re-Inspection"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

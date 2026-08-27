"use client";

import { useState } from "react";

// Lets the inspector/owner edit the FULL agreement text for one inspection
// before it is signed. Saving stores a custom override that the client sees
// verbatim; "Reset to auto-generated" clears it and goes back to the live
// template merge. Locks itself once the agreement has been signed.
export default function AgreementBodyEditor({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState("");
  const [hasCustomBody, setHasCustomBody] = useState(false);
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function openEditor() {
    setExpanded(true);
    setLoading(true);
    setLoadError("");
    setStatus("");
    try {
      const res = await fetch(
        `/api/agreement-preview?inspectionId=${encodeURIComponent(inspectionId)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load the agreement.");
      setBody(data.body || "");
      setHasCustomBody(Boolean(data.hasCustomBody));
      setSigned(Boolean(data.signed));
    } catch (err: any) {
      setLoadError(err?.message || "Could not load the agreement.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/update-agreement-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setHasCustomBody(Boolean(data.hasCustomBody));
      setStatus("Saved. Clients will see this exact text.");
    } catch (err: any) {
      setStatus(err?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function resetToAuto() {
    if (saving) return;
    if (
      !window.confirm(
        "Reset to the auto-generated agreement? Your custom text will be discarded and the agreement will rebuild from the selected template(s), date, and time.",
      )
    ) {
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/update-agreement-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, body: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not reset.");
      setHasCustomBody(false);
      // Reload the freshly regenerated text so the editor shows it.
      await openEditor();
      setStatus("Reset to the auto-generated agreement.");
    } catch (err: any) {
      setStatus(err?.message || "Could not reset.");
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 w-full max-w-full overflow-hidden rounded-2xl border border-[#232b38] bg-[#071224] shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-[#1a212c] bg-gradient-to-r from-[#10151e] via-[#0b1628] to-[#10151e] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-400">
            Agreement Text
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Edit the full agreement</h2>
          <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
            Change the wording, fix a detail, or write a one-off agreement. Only works
            before it is signed. To switch which agreement template is used, use the
            Selected Agreements panel above.
          </p>
          {hasCustomBody && (
            <span className="mt-3 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              Custom text is active — overriding the selected template
            </span>
          )}
        </div>

        {!expanded && (
          <button
            type="button"
            onClick={openEditor}
            className="shrink-0 rounded-2xl border border-teal-500/70 bg-teal-500/10 px-5 py-3 text-sm font-semibold text-teal-300 transition hover:bg-teal-500 hover:text-slate-950"
          >
            Edit agreement text
          </button>
        )}
      </div>

      {expanded && (
        <div className="p-4 sm:p-5">
          {loading ? (
            <p className="text-sm font-bold text-[#8a93a3]">Loading agreement…</p>
          ) : loadError ? (
            <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-300">
              {loadError}
            </p>
          ) : signed ? (
            <div className="rounded-xl border border-[#232b38] bg-[#131923] p-4">
              <p className="text-sm font-bold text-[#8a93a3]">
                This agreement has already been signed, so its text is locked and can no
                longer be edited. The signed copy stays exactly as the client signed it.
              </p>
            </div>
          ) : (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={20}
                spellCheck
                className="w-full resize-y rounded-2xl border border-[#232b38] bg-[#0a0e13] px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:border-teal-400"
              />

              {status && (
                <p className="mt-3 rounded-xl border border-[#232b38] bg-[#131923] px-4 py-2 text-sm font-bold text-teal-300">
                  {status}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-2xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save agreement text"}
                </button>
                <button
                  type="button"
                  onClick={resetToAuto}
                  disabled={saving || !hasCustomBody}
                  className="rounded-2xl border border-[#232b38] px-5 py-3 text-sm font-semibold text-[#e8ecf3] transition hover:bg-[#1a212c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset to auto-generated
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  disabled={saving}
                  className="rounded-2xl border border-[#232b38] px-5 py-3 text-sm font-semibold text-[#8a93a3] transition hover:bg-[#1a212c] disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-[#59626f]">
                Tip: change the inspection date or time (or switch templates) and the
                auto-generated agreement updates on its own — you only need this editor
                for custom wording.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

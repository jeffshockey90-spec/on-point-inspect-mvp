"use client";

import { useState } from "react";

type Finding = {
  id: string;
  section: string;
  title: string;
  comment: string;
  photoUrl: string;
  existingStatus: string;
  existingNotes: string;
};

export default function RepairResponseForm({
  token,
  shareId,
  findings,
}: {
  token: string;
  shareId: string;
  findings: Finding[];
}) {
  const [items, setItems] = useState(() =>
    findings.map((finding) => ({
      findingId: finding.id,
      responseStatus: finding.existingStatus || "pending",
      notes: finding.existingNotes || "",
    }))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateItem(findingId: string, updates: any) {
    setItems((current) =>
      current.map((item) => (item.findingId === findingId ? { ...item, ...updates } : item))
    );
  }

  async function submitResponse() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/repair-response/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, shareId, items }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Could not submit repair request response.");
      }

      setMessage("Response submitted successfully.");
    } catch (err: any) {
      setError(err?.message || "Could not submit repair request response.");
    } finally {
      setSaving(false);
    }
  }

  if (!findings.length) {
    return (
      <section className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-5 text-yellow-100">
        No repair request items were found for this secure link.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {findings.map((finding, index) => {
        const item = items.find((entry) => entry.findingId === finding.id);

        return (
          <div key={finding.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-lg">
            {finding.photoUrl ? (
              <img src={finding.photoUrl} alt="" className="h-56 w-full object-cover sm:h-72" />
            ) : null}

            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
                  Item {index + 1}{finding.section ? ` • ${finding.section}` : ""}
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">{finding.title}</h2>
                {finding.comment ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{finding.comment}</p> : null}
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-200">Response</span>
                <select
                  value={item?.responseStatus || "pending"}
                  onChange={(event) => updateItem(finding.id, { responseStatus: event.target.value })}
                  className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none focus:border-teal-300"
                >
                  <option value="pending">Pending / Not answered</option>
                  <option value="agree_to_repair">Agree to repair</option>
                  <option value="already_repaired">Already repaired</option>
                  <option value="credit_buyer">Credit buyer</option>
                  <option value="declined">Decline</option>
                  <option value="other">Other / see notes</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-200">Notes</span>
                <textarea
                  value={item?.notes || ""}
                  onChange={(event) => updateItem(finding.id, { notes: event.target.value })}
                  rows={4}
                  placeholder="Add notes, repair details, credits, contractor information, or explanation."
                  className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none focus:border-teal-300"
                />
              </label>
            </div>
          </div>
        );
      })}

      {message ? <div className="rounded-xl border border-green-400/30 bg-green-500/10 p-4 text-green-100">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div> : null}

      <button
        type="button"
        onClick={submitResponse}
        disabled={saving}
        className="w-full rounded-2xl bg-teal-400 px-5 py-4 text-base font-bold text-slate-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Submitting..." : "Submit Repair Response"}
      </button>
    </section>
  );
}

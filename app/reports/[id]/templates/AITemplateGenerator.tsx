"use client";

import { useState } from "react";

export default function AITemplateGenerator() {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateTemplate() {
    if (!note.trim()) {
      alert("Type a quick note first.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/generate-finding-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to generate template.");
        return;
      }

      const title = document.querySelector<HTMLInputElement>("[name='title']");
      const section = document.querySelector<HTMLSelectElement>("[name='section']");
      const severity = document.querySelector<HTMLSelectElement>("[name='severity']");
      const observation = document.querySelector<HTMLTextAreaElement>("[name='observation']");
      const implication = document.querySelector<HTMLTextAreaElement>("[name='implication']");
      const recommendation = document.querySelector<HTMLTextAreaElement>("[name='recommendation']");

      if (title) title.value = data.title || "";
      if (section) section.value = data.section || "Exterior";
      if (severity) severity.value = data.severity || "Recommended Repair";
      if (observation) observation.value = data.observation || "";
      if (implication) implication.value = data.implication || "";
      if (recommendation) recommendation.value = data.recommendation || "";
    } catch {
      alert("Something went wrong generating the template.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-teal-700 bg-[#071224] p-5">
      <h3 className="mb-2 text-xl font-semibold text-[var(--fl-accent-text)]">
        AI Template Note
      </h3>

      <p className="mb-4 text-sm text-[var(--fl-muted)]">
        Type a quick note and AI will turn it into a full reusable finding.
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Example: missing GFCI protection at kitchen counter outlets"
        rows={3}
        className="mb-4 w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)]"
      />

      <button
        type="button"
        onClick={generateTemplate}
        disabled={loading}
        className="rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
      >
        {loading ? "Generating..." : "Generate Template With AI"}
      </button>
    </div>
  );
}
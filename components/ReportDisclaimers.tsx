"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const DEFAULT_DISCLAIMER_TOPICS = [
  "Older Home Disclaimer",
  "Environmental / Hazardous Materials",
  "Lead-Based Paint",
  "Asbestos",
  "Mold / Microbial Growth",
  "Pest / Wood Destroying Insects",
  "Code Compliance",
  "Concealed / Inaccessible Areas",
  "Snow / Weather Limitations",
  "Personal Property / Stored Items",
  "Utilities Off / Not Operated",
  "Permit / Previous Work Unknown",
];

const DEFAULT_TEXT: Record<string, string> = {
  "Older Home Disclaimer":
    "Due to the age of the home, older construction methods, materials, and concealed conditions may be present. The inspection was visual and non-invasive, and hidden conditions could not be fully evaluated.",
  "Environmental / Hazardous Materials":
    "Environmental hazards and hazardous materials are outside the scope of this visual home inspection unless specifically contracted for and sampled by a qualified specialist.",
  "Lead-Based Paint":
    "Homes built prior to 1978 may contain lead-based paint. No lead testing was performed as part of this inspection. Further evaluation by a qualified specialist is recommended if confirmation is desired.",
  Asbestos:
    "Some older building materials may contain asbestos. No asbestos testing was performed as part of this inspection. Confirmation requires laboratory testing by a qualified specialist.",
  "Mold / Microbial Growth":
    "The inspection is not a mold assessment unless specifically contracted for. Visible suspect staining or moisture concerns should be further evaluated by a qualified specialist if needed.",
  "Pest / Wood Destroying Insects":
    "This inspection is not a wood-destroying insect inspection unless specifically contracted for. A licensed pest professional should be consulted for confirmation of insect activity or damage.",
  "Code Compliance":
    "This inspection is not a code compliance inspection. Comments are based on visible safety, function, and condition at the time of inspection.",
  "Concealed / Inaccessible Areas":
    "Concealed, hidden, or inaccessible areas could not be fully evaluated. Defects may exist behind finishes, stored items, insulation, wall coverings, flooring, or other obstructions.",
  "Snow / Weather Limitations":
    "Weather conditions may have limited visibility and access to some exterior components. Snow, ice, rain, or wet surfaces can conceal defects and limit inspection accuracy.",
  "Personal Property / Stored Items":
    "Personal property, furniture, stored items, or occupant belongings limited visibility and access to some components. Areas behind or beneath these items were not fully inspected.",
  "Utilities Off / Not Operated":
    "Some systems or components could not be operated because utilities were off, disconnected, inaccessible, or otherwise unavailable at the time of inspection.",
  "Permit / Previous Work Unknown":
    "The history, permits, and workmanship of previous repairs or improvements were not verified as part of this inspection. Further review with the local authority or qualified contractor may be appropriate.",
};

type DisclaimerRow = {
  id: string;
  inspection_id: string;
  topic: string;
  rough_notes?: string | null;
  disclaimer_text?: string | null;
  created_at?: string;
};

export default function ReportDisclaimers({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DisclaimerRow[]>([]);
  const [activeTopic, setActiveTopic] = useState(DEFAULT_DISCLAIMER_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [roughNotes, setRoughNotes] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function loadDisclaimers() {
      if (!inspectionId) return;

      const { data, error } = await supabase
        .from("report_disclaimers")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load disclaimers:", error);
        return;
      }

      setRows(data || []);
    }

    loadDisclaimers();
  }, [inspectionId]);

  const selectedTopics = useMemo(
    () => new Set(rows.map((row) => row.topic)),
    [rows]
  );

  const activeRow = rows.find((row) => row.topic === activeTopic);

  useEffect(() => {
    if (activeRow) {
      setRoughNotes(activeRow.rough_notes || "");
      setGeneratedText(activeRow.disclaimer_text || "");
    } else {
      setRoughNotes("");
      setGeneratedText("");
    }
  }, [activeTopic, activeRow?.id]);

  async function toggleDisclaimer(topic: string) {
    if (saving || !inspectionId) return;

    setActiveTopic(topic);
    setSaving(true);

    try {
      const existing = rows.find((row) => row.topic === topic);

      if (existing) {
        const { error } = await supabase
          .from("report_disclaimers")
          .delete()
          .eq("id", existing.id);

        if (error) throw error;

        setRows((prev) => prev.filter((row) => row.id !== existing.id));
        return;
      }

      const { data, error } = await supabase
        .from("report_disclaimers")
        .insert({
          inspection_id: inspectionId,
          topic,
          rough_notes: "",
          disclaimer_text:
            DEFAULT_TEXT[topic] ||
            "This item was not fully evaluated as part of this visual, non-invasive home inspection.",
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) setRows((prev) => [...prev, data]);
    } catch (error: any) {
      alert(error?.message || "Failed to update disclaimer.");
    } finally {
      setSaving(false);
    }
  }

  async function addCustomDisclaimer() {
    const clean = customTopic.trim();

    if (!clean || saving) return;

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("report_disclaimers")
        .insert({
          inspection_id: inspectionId,
          topic: clean,
          rough_notes: "",
          disclaimer_text:
            "This condition or limitation was noted at the time of inspection. Further review may be appropriate if additional confirmation is desired.",
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) {
        setRows((prev) => [...prev, data]);
        setActiveTopic(data.topic);
      }

      setCustomTopic("");
    } catch (error: any) {
      alert(error?.message || "Failed to add disclaimer.");
    } finally {
      setSaving(false);
    }
  }

  async function generateDisclaimer() {
    const finalTopic = activeTopic;

    if (!finalTopic) {
      alert("Choose a disclaimer first.");
      return;
    }

    if (!roughNotes.trim()) {
      alert("Add a short note for the AI first.");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch("/api/generate-disclaimer-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: finalTopic,
          notes: roughNotes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to generate disclaimer.");
        return;
      }

      setGeneratedText(data.disclaimer || "");
    } catch (error: any) {
      alert(error?.message || "Failed to generate disclaimer.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveActiveDisclaimer() {
    if (!activeTopic) {
      alert("Choose a disclaimer first.");
      return;
    }

    if (!generatedText.trim()) {
      alert("No disclaimer text to save.");
      return;
    }

    setSaving(true);

    try {
      if (activeRow) {
        const { data, error } = await supabase
          .from("report_disclaimers")
          .update({
            rough_notes: roughNotes.trim(),
            disclaimer_text: generatedText.trim(),
          })
          .eq("id", activeRow.id)
          .select("*")
          .single();

        if (error) throw error;

        setRows((prev) =>
          prev.map((row) => (row.id === activeRow.id ? data : row))
        );
      } else {
        const { data, error } = await supabase
          .from("report_disclaimers")
          .insert({
            inspection_id: inspectionId,
            topic: activeTopic,
            rough_notes: roughNotes.trim(),
            disclaimer_text: generatedText.trim(),
          })
          .select("*")
          .single();

        if (error) throw error;

        if (data) setRows((prev) => [...prev, data]);
      }

      alert("Disclaimer saved.");
    } catch (error: any) {
      alert(error?.message || "Failed to save disclaimer.");
    } finally {
      setSaving(false);
    }
  }

  const customRows = rows.filter(
    (row) => !DEFAULT_DISCLAIMER_TOPICS.includes(row.topic)
  );

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/50"
      >
        <div>
          <h3 className="text-xl font-black text-teal-300">Disclaimers</h3>
          <p className="mt-1 text-sm text-slate-400">
            {rows.length > 0
              ? `${rows.length} disclaimer${rows.length === 1 ? "" : "s"} turned on`
              : "No disclaimers turned on"}
          </p>
        </div>

        <span className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {rows.length > 0 && (
        <div className="border-t border-slate-700 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setActiveTopic(row.topic)}
                className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-sm font-bold text-yellow-200 hover:bg-yellow-500/20"
              >
                {row.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-slate-700 p-5">
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
              Turn Disclaimers On / Off
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DEFAULT_DISCLAIMER_TOPICS.map((item) => {
                const selected = selectedTopics.has(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleDisclaimer(item)}
                    disabled={saving}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-yellow-400 bg-yellow-500/15 text-yellow-100"
                        : "border-slate-600 bg-[#020617] text-white hover:border-yellow-400 hover:bg-yellow-500/10"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        selected
                          ? "border-yellow-300 bg-yellow-400 text-slate-950"
                          : "border-white"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>

                    <span className="font-bold">{item}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700 bg-[#020617] p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                + Custom Disclaimer
              </p>

              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={customTopic}
                  onChange={(event) => setCustomTopic(event.target.value)}
                  placeholder="Add custom disclaimer topic..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-white outline-none focus:border-yellow-400"
                />

                <button
                  type="button"
                  onClick={addCustomDisclaimer}
                  disabled={saving || !customTopic.trim()}
                  className="rounded-lg border border-yellow-500 px-4 py-2 text-sm font-black text-yellow-300 hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {customRows.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => toggleDisclaimer(row.topic)}
                      className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-200 hover:bg-yellow-500/20"
                    >
                      {row.topic} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-purple-300">
              AI Disclaimer Editor
            </p>

            <label className="mt-4 block">
              <p className="mb-2 text-sm font-bold text-slate-300">
                Active Disclaimer
              </p>

              <select
                value={activeTopic}
                onChange={(event) => setActiveTopic(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-purple-400"
              >
                {[
                  ...DEFAULT_DISCLAIMER_TOPICS,
                  ...customRows.map((row) => row.topic),
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <textarea
              value={roughNotes}
              onChange={(event) => setRoughNotes(event.target.value)}
              rows={3}
              placeholder="Example: home built before 1978, no testing performed, older painted surfaces may contain lead..."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] p-4 text-white outline-none focus:border-purple-400"
            />

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={generateDisclaimer}
                disabled={generating || saving || !roughNotes.trim()}
                className="rounded-xl bg-purple-500 px-5 py-3 font-black text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? "Generating..." : "AI Fill Disclaimer"}
              </button>

              <button
                type="button"
                onClick={saveActiveDisclaimer}
                disabled={saving || !generatedText.trim()}
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Disclaimer Text
              </button>
            </div>

            <textarea
              value={generatedText}
              onChange={(event) => setGeneratedText(event.target.value)}
              rows={6}
              placeholder="Disclaimer text will appear here..."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] p-4 text-white outline-none focus:border-purple-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

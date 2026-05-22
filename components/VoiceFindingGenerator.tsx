"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const SEVERITIES = [
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Maintenance",
  "Monitor",
  "Informational",
];

export default function VoiceFindingGenerator({
  reportId,
}: {
  reportId: string;
}) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");

  function startVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
    };

    recognition.onerror = () => {
      setListening(false);
      alert("Voice recognition failed. Try again.");
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  }

  async function generateFinding() {
    if (!transcript.trim()) {
      alert("Record or type a field note first.");
      return;
    }

    setProcessing(true);

    try {
      const res = await fetch("/api/voice-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate finding.");
      }

      setTitle(data.title || "");
      setSection(data.section || "Exterior");
      setSeverity(data.severity || "Recommended Repair");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(data.recommendation || "");
    } catch (error: any) {
      alert(error.message || "Something went wrong.");
    } finally {
      setProcessing(false);
    }
  }

  async function saveFinding() {
    if (!title.trim()) {
      alert("Finding title is required.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.from("findings").insert({
        inspection_id: reportId,
        title,
        section,
        severity,
        observation,
        implication,
        recommendation,
      });

      if (error) throw error;

      alert("Voice finding saved.");

      setTranscript("");
      setTitle("");
      setSection("Exterior");
      setSeverity("Recommended Repair");
      setObservation("");
      setImplication("");
      setRecommendation("");
    } catch (error: any) {
      alert(error.message || "Failed to save finding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
      <h2 className="text-2xl font-bold text-teal-400">
        Voice-to-Finding Workflow
      </h2>

      <p className="mt-2 text-slate-300">
        Speak a field note and convert it into a professional inspection
        finding.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={startVoice}
          disabled={listening}
          className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-50"
        >
          {listening ? "Listening..." : "Start Voice Note"}
        </button>

        <button
          type="button"
          onClick={generateFinding}
          disabled={processing}
          className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {processing ? "Generating..." : "Generate Finding"}
        </button>

        <button
          type="button"
          onClick={saveFinding}
          disabled={saving}
          className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black transition hover:bg-green-400 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Finding"}
        </button>
      </div>

      <label className="mt-5 block">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          Voice / Field Note
        </p>

        <textarea
          rows={4}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Example: Missing GFCI protection observed at bathroom receptacle..."
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
        />
      </label>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Finding title"
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
        />

        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
        >
          {SECTIONS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400 md:col-span-2"
        >
          {SEVERITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <TextArea label="Observation" value={observation} onChange={setObservation} />
      <TextArea label="Implication" value={implication} onChange={setImplication} />
      <TextArea label="Recommendation" value={recommendation} onChange={setRecommendation} />
    </section>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <textarea
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}
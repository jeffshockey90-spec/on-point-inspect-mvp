"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  addOfflineQueueItem,
  isOnline,
  processOfflineQueue,
} from "../lib/offlineSyncQueue";

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

type VoiceMode = "single" | "continuous";
type MessageType = "success" | "error" | "info" | "";

type Draft = {
  transcript: string;
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
};

const emptyDraft: Draft = {
  transcript: "",
  title: "",
  section: "Exterior",
  severity: "Recommended Repair",
  observation: "",
  implication: "",
  recommendation: "",
};

function normalizeCommand(text: string) {
  return text.trim().toLowerCase().replace(/[.,!?]/g, "");
}

function sectionFromSpeech(text: string) {
  const clean = normalizeCommand(text);

  return SECTIONS.find((section) => {
    const sectionClean = section.toLowerCase();
    return (
      clean.includes(sectionClean) ||
      clean.includes(sectionClean.replace(/, /g, " ")) ||
      clean.includes(sectionClean.split(",")[0])
    );
  });
}

function severityFromSpeech(text: string) {
  const clean = normalizeCommand(text);

  if (clean.includes("safety")) return "Safety Concern";
  if (clean.includes("major")) return "Major Concern";
  if (clean.includes("maintenance")) return "Maintenance";
  if (clean.includes("monitor")) return "Monitor";
  if (clean.includes("informational") || clean.includes("information only")) {
    return "Informational";
  }

  if (clean.includes("recommended repair") || clean.includes("repair")) {
    return "Recommended Repair";
  }

  return "";
}

export default function VoiceFindingGenerator({
  reportId,
}: {
  reportId: string;
}) {
  const recognitionRef = useRef<any>(null);
  const shouldContinueRef = useRef(false);

  const storageKey = useMemo(
    () => `voice-finding-draft-${reportId}`,
    [reportId]
  );

  const [voiceMode, setVoiceMode] = useState<VoiceMode>("single");
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const hasDraft =
    transcript.trim() ||
    title.trim() ||
    observation.trim() ||
    implication.trim() ||
    recommendation.trim();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      const draft = JSON.parse(saved) as Partial<Draft>;

      setTranscript(draft.transcript || "");
      setTitle(draft.title || "");
      setSection(draft.section || "Exterior");
      setSeverity(draft.severity || "Recommended Repair");
      setObservation(draft.observation || "");
      setImplication(draft.implication || "");
      setRecommendation(draft.recommendation || "");
    } catch {
      // Ignore bad local drafts.
    }
  }, [storageKey]);

  useEffect(() => {
    const draft: Draft = {
      transcript,
      title,
      section,
      severity,
      observation,
      implication,
      recommendation,
    };

    if (!hasDraft) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [
    hasDraft,
    implication,
    observation,
    recommendation,
    section,
    severity,
    storageKey,
    title,
    transcript,
  ]);

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessage("");
    setMessageType("");
  }

  function appendTranscript(text: string) {
    setTranscript((current) => {
      const next = current.trim() ? `${current.trim()}\n${text}` : text;
      return next;
    });
  }

  function clearDraft() {
    setTranscript("");
    setTitle("");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setObservation("");
    setImplication("");
    setRecommendation("");
    clearMessage();
    localStorage.removeItem(storageKey);
  }

  function applyVoiceCommand(text: string) {
    const clean = normalizeCommand(text);

    if (clean === "new finding" || clean === "clear finding") {
      clearDraft();
      showMessage("info", "Started a new voice finding.");
      return true;
    }

    if (clean === "save finding" || clean === "save this finding") {
      saveFinding();
      return true;
    }

    if (clean === "generate finding" || clean === "draft finding") {
      generateFinding();
      return true;
    }

    const spokenSection = sectionFromSpeech(clean);
    if (
      spokenSection &&
      (clean.includes("section") ||
        clean.includes("set section") ||
        clean.includes("change section"))
    ) {
      setSection(spokenSection);
      showMessage("info", `Section set to ${spokenSection}.`);
      return true;
    }

    const spokenSeverity = severityFromSpeech(clean);
    if (
      spokenSeverity &&
      (clean.includes("severity") ||
        clean.includes("set") ||
        clean.includes("concern") ||
        clean.includes("repair") ||
        clean.includes("monitor"))
    ) {
      setSeverity(spokenSeverity);
      showMessage("info", `Severity set to ${spokenSeverity}.`);
      return true;
    }

    return false;
  }

  function startVoice(mode: VoiceMode = voiceMode) {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors.
      }
    }

    shouldContinueRef.current = mode === "continuous";

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = "en-US";
    recognition.continuous = mode === "continuous";
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      showMessage(
        "info",
        mode === "continuous"
          ? "Continuous dictation started. Say “generate finding” or “save finding” as commands."
          : "Listening..."
      );
    };

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";

        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      const cleanFinal = finalText.trim();

      if (cleanFinal) {
        const handledCommand = applyVoiceCommand(cleanFinal);

        if (!handledCommand) {
          appendTranscript(cleanFinal);
        }
      }

      if (interimText.trim()) {
        showMessage("info", `Listening: ${interimText.trim()}`);
      }
    };

    recognition.onerror = (event: any) => {
      setListening(false);
      shouldContinueRef.current = false;
      showMessage("error", event?.error || "Voice recognition failed. Try again.");
    };

    recognition.onend = () => {
      setListening(false);

      if (shouldContinueRef.current && voiceMode === "continuous") {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            // Browser may block immediate restart.
          }
        }, 350);
      }
    };

    recognition.start();
  }

  function stopVoice() {
    shouldContinueRef.current = false;
    setListening(false);

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop errors.
    }
  }

  async function generateFinding() {
    if (!transcript.trim()) {
      alert("Record or type a field note first.");
      return;
    }

    setProcessing(true);
    clearMessage();

    try {
      const res = await fetch("/api/voice-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript,
          section,
          severity,
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
      showMessage("success", "Voice finding drafted. Review and save it.");
    } catch (error: any) {
      showMessage("error", error.message || "Something went wrong.");
    } finally {
      setProcessing(false);
    }
  }

  async function saveFinding() {
    if (!title.trim() && !transcript.trim()) {
      alert("Finding title or voice note is required.");
      return;
    }

    setSaving(true);
    clearMessage();

    const findingPayload = {
      inspection_id: reportId,
      title: title.trim() || "Voice Finding",
      section,
      severity,
      observation:
        observation.trim() ||
        (transcript.trim() ? `Inspector voice note: ${transcript.trim()}` : ""),
      implication,
      recommendation,
    };

    try {
      if (!isOnline()) {
        addOfflineQueueItem({
          type: "finding",
          payload: findingPayload,
        });

        showMessage(
          "success",
          "Offline voice finding saved. It will sync when connection returns."
        );
        clearDraft();
        return;
      }

      const { error } = await supabase.from("findings").insert(findingPayload);

      if (error) throw error;

      await processOfflineQueue().catch(() => {
        // Do not block the saved finding if old queue items fail.
      });

      showMessage("success", "Voice finding saved.");
      clearDraft();
    } catch (error: any) {
      try {
        addOfflineQueueItem({
          type: "finding",
          payload: findingPayload,
        });

        showMessage(
          "success",
          "Could not save online, so this voice finding was queued for offline sync."
        );
        clearDraft();
      } catch {
        showMessage("error", error.message || "Failed to save finding.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Voice Findings 2.0
          </h2>

          <p className="mt-2 text-slate-300">
            Dictate field notes, use voice commands, generate a professional
            finding, and save it directly to the report.
          </p>
        </div>

        <select
          value={voiceMode}
          onChange={(e) => setVoiceMode(e.target.value as VoiceMode)}
          disabled={listening}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400 disabled:opacity-60"
        >
          <option value="single">Single Note</option>
          <option value="continuous">Continuous Dictation</option>
        </select>
      </div>

      {message && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${
            messageType === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-300"
              : messageType === "info"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!listening ? (
          <button
            type="button"
            onClick={() => startVoice(voiceMode)}
            disabled={processing || saving}
            className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {voiceMode === "continuous"
              ? "Start Continuous Dictation"
              : "Start Voice Note"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopVoice}
            className="rounded-xl border border-red-500 bg-red-500/10 px-5 py-3 font-bold text-red-300 transition active:scale-[0.98] hover:bg-red-500/20 [touch-action:manipulation]"
          >
            Stop Listening
          </button>
        )}

        <button
          type="button"
          onClick={generateFinding}
          disabled={processing || saving || !transcript.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          {processing && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {processing ? "Generating..." : "Generate Finding"}
        </button>

        <button
          type="button"
          onClick={saveFinding}
          disabled={saving || processing || (!title.trim() && !transcript.trim())}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-5 py-3 font-bold text-black transition active:scale-[0.98] hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          {saving && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {saving ? "Saving..." : isOnline() ? "Save Finding" : "Queue Offline"}
        </button>

        <button
          type="button"
          onClick={clearDraft}
          disabled={saving || processing || !hasDraft}
          className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-300 transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          Clear Draft
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
        <p className="font-bold text-teal-300">Voice commands:</p>
        <p>
          “Generate finding” • “Save finding” • “New finding” • “Set section
          electrical” • “Safety concern” • “Major concern” • “Maintenance”
        </p>
      </div>

      <label className="mt-5 block">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          Voice / Field Note
        </p>

        <textarea
          rows={5}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Example: Double tapped breaker in panel recommend electrician..."
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

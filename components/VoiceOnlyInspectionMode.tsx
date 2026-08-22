"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { supabase } from "../lib/supabaseClient";

type Props = {
  inspectionId: string;
  currentSection: string;
  currentSeverity: string;
  online: boolean;
};

type SavedFinding = {
  id: string | number;
  title: string;
  section: string;
  severity: string;
};

const SILENCE_SAVE_DELAY_MS = 1500;

export default function VoiceOnlyInspectionMode({
  inspectionId,
  currentSection,
  currentSeverity,
  online,
}: Props) {
  const browserRecognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const activeRef = useRef(false);

  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [savedFindings, setSavedFindings] = useState<SavedFinding[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    return () => {
      stopListening();
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  function scheduleAutoSave(transcript: string) {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
    }

    silenceTimerRef.current = window.setTimeout(() => {
      void processAndSave(transcript);
    }, SILENCE_SAVE_DELAY_MS);
  }

  async function processAndSave(transcript: string) {
    const clean = transcript.trim();
    if (!clean || processingRef.current || !inspectionId) return;

    if (!online) {
      setError("Voice-only auto-save currently requires internet.");
      return;
    }

    processingRef.current = true;
    setStatus("AI is drafting and saving…");
    setError("");

    try {
      const response = await fetch("/api/voice-finding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          transcript: clean,
          section: currentSection,
          severity: currentSeverity,
        }),
      });

      const draft = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(draft?.error || "Voice finding AI failed.");
      }

      const { data, error: insertError } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title: draft.title,
          section: draft.section,
          severity: draft.severity,
          location: draft.location || null,
          observation: draft.observation,
          implication: draft.implication,
          recommendation: draft.recommendation,
        })
        .select("id,title,section,severity")
        .single();

      if (insertError) throw insertError;

      setSavedFindings((current) => [data, ...current].slice(0, 10));
      setLiveTranscript("");
      setStatus(`Saved: ${data.title}`);

      window.dispatchEvent(
        new CustomEvent("opi:inspection-data-changed", {
          detail: {
            inspectionId,
            section: data.section,
            source: "voice-only-inspection",
          },
        }),
      );

      try {
        navigator.vibrate?.([18, 35, 18]);
      } catch {}
    } catch (caught: any) {
      setError(caught?.message || "Could not save the voice finding.");
      setStatus("Listening paused");
    } finally {
      processingRef.current = false;

      if (activeRef.current) {
        window.setTimeout(() => {
          void startListening();
        }, 450);
      }
    }
  }

  async function startNativeListening() {
    const permission = await NativeSpeechRecognition.requestPermissions();
    if (permission.speechRecognition !== "granted") {
      throw new Error("Speech-recognition permission was not granted.");
    }

    await NativeSpeechRecognition.start({
      language: "en-US",
      maxResults: 1,
      partialResults: true,
      popup: false,
    });

    await NativeSpeechRecognition.addListener("partialResults", (event) => {
      const transcript = String(event.matches?.[0] || "").trim();
      if (!transcript) return;
      setLiveTranscript(transcript);
      setStatus("Listening…");
      scheduleAutoSave(transcript);
    });
  }

  function startBrowserListening() {
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!Recognition) {
      throw new Error("Speech recognition is not supported on this device.");
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += `${event.results[index][0]?.transcript || ""} `;
      }

      transcript = transcript.trim();
      if (!transcript) return;

      setLiveTranscript(transcript);
      setStatus("Listening…");
      scheduleAutoSave(transcript);
    };

    recognition.onerror = (event: any) => {
      if (event?.error !== "aborted" && event?.error !== "no-speech") {
        setError(`Voice recognition error: ${event?.error || "unknown"}`);
      }
    };

    recognition.onend = () => {
      if (activeRef.current && !processingRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {}
        }, 250);
      }
    };

    browserRecognitionRef.current = recognition;
    recognition.start();
  }

  async function startListening() {
    if (!activeRef.current || processingRef.current) return;

    try {
      setError("");
      setStatus("Listening…");

      if (Capacitor.isNativePlatform()) {
        await startNativeListening();
      } else {
        startBrowserListening();
      }
    } catch (caught: any) {
      setError(caught?.message || "Could not start voice mode.");
      setActive(false);
      activeRef.current = false;
    }
  }

  async function stopListening() {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      browserRecognitionRef.current?.stop?.();
    } catch {}
    browserRecognitionRef.current = null;

    if (Capacitor.isNativePlatform()) {
      try {
        await NativeSpeechRecognition.stop();
        await NativeSpeechRecognition.removeAllListeners();
      } catch {}
    }
  }

  async function toggleActive() {
    if (active) {
      setActive(false);
      activeRef.current = false;
      await stopListening();
      setStatus("Stopped");
      return;
    }

    if (!inspectionId) {
      setError("Select an inspection first.");
      return;
    }

    setActive(true);
    activeRef.current = true;
    setLiveTranscript("");
    await startListening();
  }

  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
        Voice-Only Inspection
      </p>
      <h2 className="mt-1 text-xl font-black">
        Walk, Narrate, and Auto-Save
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-300">
        Speak one finding at a time, then pause. AI drafts and saves it
        automatically while listening resumes.
      </p>

      <button
        type="button"
        onClick={() => void toggleActive()}
        disabled={!online || !inspectionId}
        className={`mt-4 min-h-[50px] w-full rounded-xl px-4 py-3 font-black transition active:scale-[0.98] disabled:opacity-50 ${
          active
            ? "bg-red-500 text-white"
            : "bg-emerald-400 text-black"
        }`}
      >
        {active ? "■ Stop Voice-Only Mode" : "🎙 Start Voice-Only Mode"}
      </button>

      <div className="mt-3 rounded-xl border border-slate-700 bg-black/35 p-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          Status
        </p>
        <p className="mt-1 font-bold text-white">{status}</p>
        {liveTranscript && (
          <p className="mt-2 text-sm leading-6 text-emerald-100">
            “{liveTranscript}”
          </p>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm font-bold text-red-100">
          {error}
        </div>
      )}

      {savedFindings.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
            Recently Saved
          </p>
          {savedFindings.map((finding) => (
            <div
              key={finding.id}
              className="rounded-xl border border-emerald-500/30 bg-black/30 px-3 py-2"
            >
              <p className="font-black">{finding.title}</p>
              <p className="text-xs text-slate-300">
                {finding.section} · {finding.severity}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

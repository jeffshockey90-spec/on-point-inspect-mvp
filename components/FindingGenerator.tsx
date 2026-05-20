"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function FindingGenerator({
  reportId,
}: {
  reportId: string;
}) {
  const router = useRouter();
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const [note, setNote] = useState("");
  const [section, setSection] = useState("Roof");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  function handleVoiceNote() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (isIOS() || !SpeechRecognition) {
      noteRef.current?.focus();

      alert(
        "On iPhone, tap the microphone on the keyboard after the note box opens."
      );

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
      const transcript = event.results[0][0].transcript;

      setNote((prev) =>
        prev ? `${prev} ${transcript}` : transcript
      );
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event);
      alert(`Voice capture failed: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  }

  async function handleGenerate() {
    try {
      setLoading(true);

      let imageUrl = "";

      if (image) {
        const fileName = `${Date.now()}-${image.name}`;

        const { error: uploadError } = await supabase.storage
          .from("inspection-images")
          .upload(fileName, image);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("inspection-images")
          .getPublicUrl(fileName);

        imageUrl = data.publicUrl;
      }

      const aiRes = await fetch(
        `${window.location.origin}/api/generate-finding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            note,
            section,
          }),
        }
      );

      const finding = await aiRes.json();

      if (!aiRes.ok) {
        throw new Error(
          finding.error || "AI generation failed"
        );
      }

      const saveRes = await fetch(
        `${window.location.origin}/api/save-finding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_id: reportId,
            section,
            title: finding.title,
            observation: finding.observation,
            implication: finding.implication,
            recommendation: finding.recommendation,
            image_url: imageUrl,
          }),
        }
      );

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
        throw new Error(
          saveData.error || "Failed to save finding"
        );
      }

      setNote("");
      setImage(null);

      router.refresh();

      alert("Finding saved!");
    } catch (err: any) {
      console.error("GENERATE ERROR:", err);
      alert(err.message || "Error generating finding");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 print:hidden">
      <h2 className="mb-4 text-2xl font-bold text-white">
        AI Finding Generator
      </h2>

      <div className="space-y-4">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="w-full rounded bg-zinc-800 p-4 text-lg text-white"
        >
          <option>Roof</option>
          <option>Exterior</option>
          <option>Electrical</option>
          <option>Plumbing</option>
          <option>HVAC</option>
          <option>Interior</option>
          <option>Attic</option>
          <option>Foundation</option>
        </select>

        <textarea
          ref={noteRef}
          placeholder="Inspector notes..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[150px] w-full rounded bg-zinc-800 p-4 text-lg text-white"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleVoiceNote}
            disabled={loading || listening}
            className="flex-1 rounded-lg bg-blue-600 px-5 py-4 text-lg font-semibold text-white disabled:opacity-60"
          >
            {listening ? "Listening..." : "🎤 Speak Note"}
          </button>

          <button
            type="button"
            onClick={() => setNote("")}
            disabled={loading}
            className="flex-1 rounded-lg bg-zinc-700 px-5 py-4 text-lg font-semibold text-white disabled:opacity-60"
          >
            Clear Note
          </button>
        </div>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) =>
            setImage(e.target.files?.[0] || null)
          }
          className="w-full rounded bg-zinc-800 p-4 text-white"
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !note.trim()}
          className="w-full rounded-lg bg-teal-500 px-5 py-4 text-lg font-bold text-black disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate Finding"}
        </button>
      </div>
    </div>
  );
}
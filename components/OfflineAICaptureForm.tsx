"use client";

import { useState } from "react";

const STORAGE_KEY = "on_point_offline_ai_queue";

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
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

export default function OfflineAICaptureForm({
  reportId,
}: {
  reportId: string;
}) {
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [note, setNote] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [message, setMessage] = useState("");

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image."));

      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;

    const dataUrl = await readFileAsDataUrl(file);
    setImageDataUrl(dataUrl);
  }

  function saveOfflineFinding() {
    if (!note.trim() && !imageDataUrl) {
      setMessage("Add a note or photo first.");
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];

    queue.push({
      id: crypto.randomUUID(),
      reportId,
      section,
      severity,
      note,
      imageDataUrl,
      createdAt: new Date().toISOString(),
      status: "queued",
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));

    setNote("");
    setImageDataUrl("");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setMessage("Saved offline. It will sync when internet is available.");
  }

  return (
    <section className="mt-8 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 print:hidden">
      <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
        Offline AI Capture
      </h2>

      <p className="mt-2 text-sm text-[var(--fl-muted)]">
        Save notes and photos in the field. They will sync later when you have
        service.
      </p>

      <div className="mt-5 space-y-4">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)]"
        >
          {SECTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)]"
        >
          {SEVERITIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)]"
        />

        {imageDataUrl && (
          <img
            src={imageDataUrl}
            alt="Offline preview"
            className="max-h-80 w-full rounded-xl border border-[var(--fl-line)] object-contain"
          />
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Example: Missing GFCI protection at kitchen counter outlet."
          className="min-h-32 w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)]"
        />

        {message && (
          <p className="rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-accent-text)]">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={saveOfflineFinding}
          className="w-full rounded-xl bg-teal-500 px-5 py-4 font-bold text-black hover:bg-teal-400"
        >
          Save Offline Finding
        </button>
      </div>
    </section>
  );
}
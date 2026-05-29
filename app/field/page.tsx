"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import CommentLibrary from "../../components/CommentLibrary";
import OfflineSyncStatus from "../../components/OfflineSyncStatus";
import {
  addOfflineQueueItem,
  filesToOfflinePhotos,
  isOnline,
} from "../../lib/offlineSyncQueue";

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

export default function FieldPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0f172a] p-10 text-white">
          Loading field workflow...
        </main>
      }
    >
      <FieldPageContent />
    </Suspense>
  );
}

function FieldPageContent() {
  const searchParams = useSearchParams();
  const reportFromUrl =
    searchParams.get("report") ||
    searchParams.get("inspection_id") ||
    "";

  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] =
    useState(reportFromUrl || "");
  const [title, setTitle] = useState("");
  const [section, setSection] =
    useState("Exterior");
  const [severity, setSeverity] = useState(
    "Recommended Repair"
  );
  const [note, setNote] = useState("");
  const [observation, setObservation] =
    useState("");
  const [implication, setImplication] =
    useState("");
  const [recommendation, setRecommendation] =
    useState("");
  const [photos, setPhotos] = useState<File[]>(
    []
  );
  const [generating, setGenerating] =
    useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setReports(data || []);
  }

  function resetForm() {
    setTitle("");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setNote("");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setPhotos([]);
  }

  function useComment(comment: any) {
    setTitle(comment.title || "");
    setSection(comment.section || "Exterior");
    setSeverity(
      comment.severity || "Recommended Repair"
    );
    setObservation(comment.observation || "");
    setImplication(comment.implication || "");
    setRecommendation(
      comment.recommendation || ""
    );
  }

  async function generateWithAI() {
    if (!note.trim()) {
      alert("Enter a quick inspector note first.");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch("/api/ai-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note,
          title,
          observation,
          implication,
          recommendation,
          section,
          severity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "AI failed");
        return;
      }

      setTitle(data.title || "");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(
        data.recommendation || ""
      );
      setSection(data.section || "Exterior");
      setSeverity(
        data.severity || "Recommended Repair"
      );
    } finally {
      setGenerating(false);
    }
  }

  async function saveFinding() {
    if (!selectedReport) {
      alert("Select a report");
      return;
    }

    if (!title.trim()) {
      alert(
        "Add a title or generate with AI first."
      );
      return;
    }

    if (!isOnline()) {
      setSaving(true);

      try {
        const offlinePhotos =
          await filesToOfflinePhotos(photos);

        addOfflineQueueItem({
          type: "finding",
          payload: {
            inspection_id: selectedReport,
            title,
            section,
            severity,
            observation,
            implication,
            recommendation,
            image_url: null,
            photos: offlinePhotos,
          },
        });

        resetForm();

        alert(
          `You are offline. This finding${
            offlinePhotos.length > 0
              ? " and photo(s)"
              : ""
          } were saved to the offline queue and will sync when connection returns.`
        );
      } catch (error: any) {
        alert(
          error.message ||
            "Failed to save offline finding."
        );
      } finally {
        setSaving(false);
      }

      return;
    }

    setSaving(true);

    try {
      const uploadedPhotos: {
        publicUrl: string;
        filePath: string;
      }[] = [];

      for (const photo of photos) {
        const fileName = `${selectedReport}/${Date.now()}-${photo.name}`;

        const { error: uploadError } =
          await supabase.storage
            .from("inspection-photos")
            .upload(fileName, photo);

        if (uploadError) {
          alert(uploadError.message);
          setSaving(false);
          return;
        }

        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(fileName);

        uploadedPhotos.push({
          publicUrl: data.publicUrl,
          filePath: fileName,
        });
      }

      const { data: finding, error } =
        await supabase
          .from("findings")
          .insert({
            inspection_id: selectedReport,
            title,
            section,
            severity,
            observation,
            implication,
            recommendation,
            image_url:
              uploadedPhotos.find((photo: any) =>
                String(photo.filePath || "").match(/\.(jpg|jpeg|png|webp|gif|heic)$/i)
              )?.publicUrl || null,
          })
          .select()
          .single();

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }

      if (uploadedPhotos.length > 0) {
        const photoRows = uploadedPhotos.map(
          (photo) => ({
            inspection_id: selectedReport,
            finding_id: finding.id,
            public_url: photo.publicUrl,
            file_path: photo.filePath,
          })
        );

        const { error: photoError } =
          await supabase
            .from("photos")
            .insert(photoRows);

        if (photoError) {
          alert(photoError.message);
          setSaving(false);
          return;
        }
      }

      resetForm();

      alert("Finding saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0f172a] p-4 text-white">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl bg-[#111827] p-5 shadow-2xl">
          <h1 className="mb-2 text-3xl font-bold text-teal-400">
            On Point Field Workflow
          </h1>

          <p className="mb-6 text-slate-400">
            Take photos or choose media, enter quick notes,
            generate AI findings, and save
            directly to the report.
          </p>

          <div className="mb-6">
            <OfflineSyncStatus />
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block font-bold">
                Select Report
              </label>

              <select
                value={selectedReport}
                onChange={(e) =>
                  setSelectedReport(
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
              >
                <option value="">
                  Select Report
                </option>

                {reports.map((report) => (
                  <option
                    key={report.id}
                    value={report.id}
                  >
                    {report.property_address ||
                      report.address ||
                      "Unnamed Inspection"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block font-bold">
                Quick Inspector Note
              </label>

              <textarea
                value={note}
                onChange={(e) =>
                  setNote(e.target.value)
                }
                rows={4}
                placeholder="Example: double tapped neutral in main panel, recommend electrician"
                className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
              />
            </div>

            <button
              onClick={generateWithAI}
              disabled={generating}
              className="w-full rounded-xl bg-teal-500 p-4 text-lg font-bold text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {generating
                ? "Generating AI Finding..."
                : "Generate Finding with AI"}
            </button>

            <div>
              <label className="mb-2 block font-bold">
                Title
              </label>

              <input
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block font-bold">
                  Section
                </label>

                <select
                  value={section}
                  onChange={(e) =>
                    setSection(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                >
                  {SECTIONS.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block font-bold">
                  Severity
                </label>

                <select
                  value={severity}
                  onChange={(e) =>
                    setSeverity(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                >
                  {SEVERITIES.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <TextArea
              label="Observation"
              value={observation}
              onChange={setObservation}
            />

            <TextArea
              label="Implication"
              value={implication}
              onChange={setImplication}
            />

            <TextArea
              label="Recommendation"
              value={recommendation}
              onChange={setRecommendation}
            />

            <div>
              <label className="mb-2 block font-bold">
                Media
              </label>

              <MediaUploadButtons
                onChange={(e) =>
                  setPhotos(
                    Array.from(
                      e.target.files || []
                    )
                  )
                }
              />
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {photos.map((photo, index) => (
                  <MediaPreview
                    key={`${photo.name}-${index}`}
                    file={photo}
                  />
                ))}
              </div>
            )}

            <button
              onClick={saveFinding}
              disabled={saving}
              className="w-full rounded-xl bg-white p-4 text-lg font-bold text-black hover:bg-slate-200 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save Finding to Report"}
            </button>

            {selectedReport && (
              <a
                href={`/reports/${selectedReport}`}
                className="block rounded-xl border border-teal-500 p-4 text-center font-bold text-teal-400 hover:bg-teal-500 hover:text-black"
              >
                Open This Report
              </a>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <CommentLibrary
            onUseComment={useComment}
          />
        </div>
      </div>
    </main>
  );
}


function MediaUploadButtons({
  onChange,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-teal-300 hover:bg-teal-500 hover:text-black">
        📷 Take Photos
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black">
        🖼 Choose Photos
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      <label className="cursor-pointer rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 hover:bg-purple-500 hover:text-white">
        🎥 Choose Videos
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>
    </div>
  );
}

function MediaPreview({ file }: { file: File }) {
  const url = URL.createObjectURL(file);

  if (file.type.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        className="h-40 w-full rounded-xl border border-slate-700 bg-black object-contain"
      />
    );
  }

  return (
    <img
      src={url}
      alt="Preview"
      className="h-40 w-full rounded-xl border border-slate-700 object-cover"
    />
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
    <div>
      <label className="mb-2 block font-bold">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        rows={5}
        className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
      />
    </div>
  );
}

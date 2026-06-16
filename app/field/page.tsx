"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import CommentLibrary from "../../components/CommentLibrary";
import OfflineSyncStatus from "../../components/OfflineSyncStatus";
import {
  addOfflineQueueItem,
  filesToOfflinePhotos,
  getOfflineQueueSummary,
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

type PhotoType = "finding" | "reference_photo";

type UploadedPhoto = {
  publicUrl: string;
  filePath: string;
};

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

function isNativeCapacitorApp() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as any).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function FieldPageContent() {
  const searchParams = useSearchParams();
  const reportFromUrl =
    searchParams.get("report") || searchParams.get("inspection_id") || "";

  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState(reportFromUrl || "");
  const [photoType, setPhotoType] = useState<PhotoType>("finding");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [note, setNote] = useState("");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [takingNativePhoto, setTakingNativePhoto] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");

  const nativeApp = useMemo(() => isNativeCapacitorApp(), []);
  const offlineSummary = useMemo(() => getOfflineQueueSummary(), [message, photos.length, online]);

  useEffect(() => {
    setOnline(isOnline());
    loadReports();

    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      photos.forEach((photo: any) => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      });
    };
  }, []);

  async function loadReports() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setReports(data || []);
  }

  function resetForm() {
    setTitle("");
    setPhotoType("finding");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setNote("");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setPhotos([]);
  }

  function useComment(comment: any) {
    setPhotoType("finding");
    setTitle(comment.title || "");
    setSection(comment.section || "Exterior");
    setSeverity(comment.severity || "Recommended Repair");
    setObservation(comment.observation || "");
    setImplication(comment.implication || "");
    setRecommendation(comment.recommendation || "");
  }

  function addFiles(nextFiles: File[]) {
    const validFiles = nextFiles.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    setPhotos((current) => [...current, ...validFiles].slice(0, 6));
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function takeNativePhotoAndSaveToGallery() {
    if (takingNativePhoto) return;

    if (!nativeApp) {
      setMessage("Use Take Photos or Choose Photos on web. Native gallery saving works inside the iOS app.");
      return;
    }

    setTakingNativePhoto(true);
    setMessage("");

    try {
      const cameraModule = await import("@capacitor/camera");
      const { Camera, CameraResultType, CameraSource } = cameraModule;

      const image = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: true,
        correctOrientation: true,
      });

      if (!image.webPath) {
        throw new Error("Camera did not return a usable photo path.");
      }

      const response = await fetch(image.webPath);
      const blob = await response.blob();
      const fileName = `on-point-${Date.now()}.${image.format || "jpg"}`;
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
        lastModified: Date.now(),
      });

      addFiles([file]);
      setMessage("Photo added and saved to your phone gallery.");
    } catch (error: any) {
      setMessage(error?.message || "Could not take native photo.");
    } finally {
      setTakingNativePhoto(false);
    }
  }

  async function generateWithAI() {
    if (!online) {
      setMessage("AI needs internet. Save your notes/photos offline, then run AI when service returns.");
      return;
    }

    if (!note.trim()) {
      setMessage("Enter a quick inspector note first.");
      return;
    }

    setGenerating(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setMessage(data.error || "AI failed");
        return;
      }

      setPhotoType("finding");
      setTitle(data.title || "");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(data.recommendation || "");
      setSection(data.section || "Exterior");
      setSeverity(data.severity || "Recommended Repair");
      setMessage("AI finding generated. Review it before saving.");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadPhotoFile(photo: File, folder: string): Promise<UploadedPhoto> {
    const safeName = photo.name.replace(/[^a-zA-Z0-9.\-_]/g, "-").slice(0, 80);
    const fileName = `${selectedReport}/${folder}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, photo, {
        cacheControl: "31536000",
        upsert: false,
        contentType: photo.type || undefined,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("inspection-photos").getPublicUrl(fileName);

    return {
      publicUrl: data.publicUrl,
      filePath: fileName,
    };
  }

  async function saveReferencePhotosOnline() {
    if (photos.length === 0) {
      throw new Error("Add at least one photo for a section reference photo.");
    }

    const imagePhotos = photos.filter((photo) => photo.type.startsWith("image/"));

    if (imagePhotos.length !== photos.length) {
      throw new Error("Reference photos must be images. Videos can be saved as finding media while online.");
    }

    let saved = 0;

    for (const photo of imagePhotos) {
      const uploaded = await uploadPhotoFile(photo, `reference-photos/${section.replace(/[^a-zA-Z0-9-_]/g, "-")}`);

      const { error } = await supabase.from("section_reference_photos").insert({
        inspection_id: selectedReport,
        section,
        caption: note.trim() || title.trim() || null,
        file_path: uploaded.filePath,
        public_url: uploaded.publicUrl,
      });

      if (error) throw error;
      saved += 1;
    }

    return saved;
  }

  async function saveFindingOnline() {
    const uploadedPhotos: UploadedPhoto[] = [];

    for (const photo of photos) {
      uploadedPhotos.push(await uploadPhotoFile(photo, "field-media"));
    }

    const fallbackTitle = title.trim() || note.trim().slice(0, 80) || "Field Finding";
    const fallbackObservation = observation.trim() || (note.trim() ? `Inspector field note: ${note.trim()}` : "");

    const { data: finding, error } = await supabase
      .from("findings")
      .insert({
        inspection_id: selectedReport,
        title: fallbackTitle,
        section,
        severity,
        observation: fallbackObservation,
        implication,
        recommendation,
        image_url:
          uploadedPhotos.find((photo) =>
            String(photo.filePath || "").match(/\.(jpg|jpeg|png|webp|gif|heic)$/i)
          )?.publicUrl || null,
      })
      .select()
      .single();

    if (error) throw error;

    if (uploadedPhotos.length > 0) {
      const photoRows = uploadedPhotos.map((photo) => ({
        inspection_id: selectedReport,
        finding_id: finding.id,
        public_url: photo.publicUrl,
        file_path: photo.filePath,
      }));

      const { error: photoError } = await supabase.from("photos").insert(photoRows);
      if (photoError) throw photoError;
    }

    return finding;
  }

  async function saveFieldItem() {
    if (!selectedReport) {
      setMessage("Select a report first.");
      return;
    }

    if (photoType === "finding" && !title.trim() && !note.trim() && !observation.trim()) {
      setMessage("Add a title, observation, or inspector note before saving.");
      return;
    }

    if (photoType === "reference_photo" && photos.length === 0) {
      setMessage("Add at least one photo before saving a reference photo.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (!isOnline()) {
        const offlinePhotos = await filesToOfflinePhotos(photos);

        addOfflineQueueItem({
          type: photoType,
          payload: {
            inspection_id: selectedReport,
            title,
            section,
            severity,
            inspector_note: note,
            note,
            caption: note || title,
            observation,
            implication,
            recommendation,
            photos: offlinePhotos,
          },
        });

        resetForm();
        const summary = getOfflineQueueSummary();
        setMessage(
          `Saved offline. Queue: ${summary.count + 1} item(s). It will sync when service returns.`
        );
        return;
      }

      if (photoType === "reference_photo") {
        const count = await saveReferencePhotosOnline();
        resetForm();
        setMessage(`${count} reference photo${count === 1 ? "" : "s"} saved to ${section}.`);
        return;
      }

      await saveFindingOnline();
      resetForm();
      setMessage("Finding saved to report.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to save field item.");
    } finally {
      setSaving(false);
      setOnline(isOnline());
    }
  }

  return (
    <main className="min-h-screen bg-[#0f172a] p-4 text-white">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl bg-[#111827] p-5 shadow-2xl">
          <h1 className="mb-2 text-3xl font-bold text-teal-400">On Point Field Workflow</h1>

          <p className="mb-4 text-slate-400">
            Capture photos, notes, findings, and reference photos in the field. If service drops, items save locally and sync when you are back online.
          </p>

          <div className="mb-4 rounded-xl border border-slate-700 bg-black/40 p-4 text-sm text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`font-black ${online ? "text-green-300" : "text-yellow-300"}`}>
                {online ? "Online" : "Offline Mode"}
              </span>
              <span>
                Queue: {offlineSummary.count} item(s), about {offlineSummary.megabytes} MB
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Native iOS camera captures will also save a copy to your phone gallery when allowed.
            </p>
          </div>

          <div className="mb-6">
            <OfflineSyncStatus />
          </div>

          {message && (
            <div className="mb-5 rounded-xl border border-teal-500/40 bg-teal-950/20 p-4 text-sm font-bold text-teal-200">
              {message}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="mb-2 block font-bold">Select Report</label>
              <select
                value={selectedReport}
                onChange={(e) => setSelectedReport(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
              >
                <option value="">Select Report</option>
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.property_address || report.address || "Unnamed Inspection"}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block font-bold">Item Type</label>
                <select
                  value={photoType}
                  onChange={(e) => setPhotoType(e.target.value as PhotoType)}
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                >
                  <option value="finding">Finding / Defect</option>
                  <option value="reference_photo">Section Reference Photo</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block font-bold">Section</label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                >
                  {SECTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block font-bold">Quick Inspector Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Example: double tapped neutral in main panel, recommend electrician"
                className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
              />
            </div>

            <button
              type="button"
              onClick={generateWithAI}
              disabled={generating || saving || !online || photoType === "reference_photo"}
              className="w-full rounded-xl bg-teal-500 p-4 text-lg font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
            >
              {generating ? "Generating AI Finding..." : online ? "Generate Finding with AI" : "AI Available When Back Online"}
            </button>

            {photoType === "finding" && (
              <>
                <div>
                  <label className="mb-2 block font-bold">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-bold">Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                  >
                    {SEVERITIES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <TextArea label="Observation" value={observation} onChange={setObservation} />
                <TextArea label="Implication" value={implication} onChange={setImplication} />
                <TextArea label="Recommendation" value={recommendation} onChange={setRecommendation} />
              </>
            )}

            <div>
              <label className="mb-2 block font-bold">Media</label>
              <MediaUploadButtons
                nativeApp={nativeApp}
                takingNativePhoto={takingNativePhoto}
                onNativeTakePhoto={takeNativePhotoAndSaveToGallery}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.currentTarget.value = "";
                }}
              />
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {photos.map((photo, index) => (
                  <MediaPreview
                    key={`${photo.name}-${photo.lastModified}-${index}`}
                    file={photo}
                    onRemove={() => removePhoto(index)}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={saveFieldItem}
              disabled={saving}
              className="w-full rounded-xl bg-white p-4 text-lg font-bold text-black transition active:scale-[0.98] hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
            >
              {saving
                ? "Saving..."
                : photoType === "reference_photo"
                  ? online
                    ? "Save Reference Photo"
                    : "Save Reference Photo Offline"
                  : online
                    ? "Save Finding to Report"
                    : "Save Finding Offline"}
            </button>

            {selectedReport && (
              <a
                href={`/reports/${selectedReport}`}
                className="block rounded-xl border border-teal-500 p-4 text-center font-bold text-teal-400 transition hover:bg-teal-500 hover:text-black"
              >
                Open This Report
              </a>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <CommentLibrary onUseComment={useComment} />
        </div>
      </div>
    </main>
  );
}

function MediaUploadButtons({
  nativeApp,
  takingNativePhoto,
  onNativeTakePhoto,
  onChange,
}: {
  nativeApp: boolean;
  takingNativePhoto: boolean;
  onNativeTakePhoto: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {nativeApp ? (
        <button
          type="button"
          onClick={onNativeTakePhoto}
          disabled={takingNativePhoto}
          className="rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-teal-300 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {takingNativePhoto ? "Opening Camera..." : "📷 Take Photo + Save to Gallery"}
        </button>
      ) : (
        <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-teal-300 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black [touch-action:manipulation]">
          📷 Take Photos
          <input type="file" accept="image/*" capture="environment" multiple onChange={onChange} className="hidden" />
        </label>
      )}

      <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-black [touch-action:manipulation]">
        🖼 Choose Photos
        <input type="file" accept="image/*" multiple onChange={onChange} className="hidden" />
      </label>

      <label className="cursor-pointer rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white [touch-action:manipulation]">
        🎥 Choose Videos
        <input type="file" accept="video/*" multiple onChange={onChange} className="hidden" />
      </label>
    </div>
  );
}

function MediaPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
      {file.type.startsWith("video/") ? (
        <video src={url} controls className="h-40 w-full bg-black object-contain" />
      ) : (
        <img src={url} alt="Preview" className="h-40 w-full object-cover" />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="w-full border-t border-slate-700 px-3 py-2 text-xs font-black text-red-300 transition hover:bg-red-500/10"
      >
        Remove
      </button>
    </div>
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
      <label className="mb-2 block font-bold">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
      />
    </div>
  );
}

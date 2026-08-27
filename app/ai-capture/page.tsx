"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import FastLinkButton from "../../components/FastLinkButton";
import { supabase } from "../../lib/supabaseClient";

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

export default function AICapturePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
          Loading...
        </main>
      }
    >
      <AICaptureContent />
    </Suspense>
  );
}

function AICaptureContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id") || "";

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const isVideo = file?.type.startsWith("video/") || false;
  const isImage = file?.type.startsWith("image/") || false;
  const [inspectorNote, setInspectorNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzeLabel, setAnalyzeLabel] = useState("Analyze Photo");
  const [saveLabel, setSaveLabel] = useState("Save Finding to Report");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [photoType, setPhotoType] = useState<"finding" | "reference">("finding");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [equipmentType, setEquipmentType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [estimatedAge, setEstimatedAge] = useState("");
  const [notes, setNotes] = useState("");

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessageType("");
    setMessage("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];

    if (!selected) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selected);
    clearMessage();
    setPreviewUrl(URL.createObjectURL(selected));

    if (selected.type.startsWith("video/")) {
      setTitle((current) => current || "Video Attachment");
      setSeverity("Informational");
      setObservation(
        (current) =>
          current ||
          "Video media was added to document the condition observed at the time of inspection.",
      );
      setImplication(
        (current) =>
          current ||
          "Video is provided for client reference and additional visual context.",
      );
      setRecommendation(
        (current) =>
          current ||
          "Review the attached video along with the written finding. Further evaluation or repair should be performed by the appropriate qualified contractor if concerns are present.",
      );
    }
  }

  async function analyzeImage() {
    if (loading || saving) return;

    if (!file) {
      showMessage("error", "Please select a photo first.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showMessage(
        "error",
        "AI analysis works with photos only. Videos can be saved to the report, but they cannot be analyzed yet.",
      );
      return;
    }

    setLoading(true);
    clearMessage();
    setAnalyzeLabel("Preparing Photo...");

    try {
      const base64 = await fileToBase64(file);

      setAnalyzeLabel("Analyzing...");

      const res = await fetch("/api/ai-photo-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          mode: "inspection",
          inspectorNote,
          inspectionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI analysis failed.");
      }

      setTitle(data.title || "");
      setSection(data.section || "Exterior");
      setSeverity(data.severity || "Recommended Repair");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(data.recommendation || "");

      setEquipmentType(data.equipment_type || "");
      setManufacturer(data.manufacturer || "");
      setModelNumber(data.model_number || "");
      setSerialNumber(data.serial_number || "");
      setEstimatedAge(data.estimated_age || "");
      setNotes(data.notes || "");
      setAnalyzeLabel("Analysis Complete");
      showMessage(
        "success",
        "AI analysis complete. Review the finding, then save it to the report.",
      );
    } catch (error: any) {
      setAnalyzeLabel("Failed");
      showMessage("error", error.message || "Something went wrong.");
    } finally {
      setLoading(false);

      window.setTimeout(() => {
        setAnalyzeLabel("Analyze Photo");
      }, 900);
    }
  }

  async function saveFinding() {
    if (saving || loading) return;

    if (!inspectionId) {
      showMessage(
        "error",
        "Missing inspection ID. Open AI Capture from inside a report.",
      );
      return;
    }

    if (photoType === "finding" && !title.trim()) {
      showMessage("error", "Finding title is required.");
      return;
    }

    if (photoType === "reference") {
      if (!file) {
        showMessage("error", "Please select a reference photo first.");
        return;
      }

      if (!file.type.startsWith("image/")) {
        showMessage("error", "Reference photos must be images.");
        return;
      }
    }

    setSaving(true);
    clearMessage();
    setSaveLabel(
      photoType === "reference"
        ? "Preparing Reference Photo..."
        : file
          ? "Preparing Media..."
          : "Saving Finding...",
    );

    try {
      if (photoType === "reference") {
        if (!file || !file.type.startsWith("image/")) {
          throw new Error("Reference photos require an image.");
        }

        setSaveLabel("Optimizing Reference Photo...");
        const uploadFile = await createFullImageForUpload(file);

        setSaveLabel("Creating Thumbnail...");
        const thumbnailFile = await createThumbnailForUpload(file);

        const safeSection = section
          .replace(/[^a-zA-Z0-9-_]/g, "-")
          .slice(0, 50);

        const safeName = uploadFile.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9-_]/g, "-")
          .slice(0, 40);

        const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
        const filePath = `${inspectionId}/reference-photos/${safeSection}/${baseName}.jpg`;
        const thumbnailPath = `${inspectionId}/reference-photos/${safeSection}/thumbnails/${baseName}-thumb.jpg`;

        setSaveLabel("Uploading Reference Photo...");

        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(filePath, uploadFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType: uploadFile.type || "image/jpeg",
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(filePath);

        let thumbnailUrl = "";

        setSaveLabel("Uploading Thumbnail...");

        const { error: thumbnailUploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(thumbnailPath, thumbnailFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType: "image/jpeg",
          });

        if (!thumbnailUploadError) {
          const { data: thumbnailData } = supabase.storage
            .from("inspection-photos")
            .getPublicUrl(thumbnailPath);

          thumbnailUrl = thumbnailData.publicUrl;
        }

        setSaveLabel("Saving Reference Photo...");

        const { error: referenceError } = await supabase
          .from("section_reference_photos")
          .insert({
            inspection_id: inspectionId,
            section,
            caption: inspectorNote.trim() || title.trim() || null,
            file_path: filePath,
            public_url: publicData.publicUrl,
            thumbnail_path: thumbnailUrl ? thumbnailPath : null,
            thumbnail_url: thumbnailUrl || null,
          });

        if (referenceError) throw referenceError;

        setSaveLabel("Opening Report...");
        showMessage("success", "Reference photo saved. Opening report...");
        window.location.assign(`/reports/${inspectionId}`);
        return;
      }

      let imageUrl = "";
      let filePath = "";

      let thumbnailUrl = "";
      let thumbnailPath = "";

      if (file) {
        const isImageUpload = file.type.startsWith("image/");
        setSaveLabel(
          isImageUpload ? "Optimizing Photo..." : "Preparing Video...",
        );
        const uploadFile = isImageUpload
          ? await createFullImageForUpload(file)
          : file;
        setSaveLabel(
          isImageUpload ? "Creating Thumbnail..." : "Preparing Video...",
        );
        const thumbnailFile = isImageUpload
          ? await createThumbnailForUpload(file)
          : null;

        const fileExt = isImageUpload
          ? "jpg"
          : uploadFile.name.split(".").pop() || "mp4";

        const safeName = uploadFile.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9-_]/g, "-")
          .slice(0, 40);

        const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

        filePath = `${inspectionId}/${baseName}.${fileExt}`;

        setSaveLabel("Uploading Media...");

        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(filePath, uploadFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType: uploadFile.type || undefined,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(filePath);

        imageUrl = data.publicUrl;

        if (thumbnailFile) {
          thumbnailPath = `${inspectionId}/thumbnails/${baseName}-thumb.jpg`;

          setSaveLabel("Uploading Thumbnail...");

          const { error: thumbnailUploadError } = await supabase.storage
            .from("inspection-photos")
            .upload(thumbnailPath, thumbnailFile, {
              cacheControl: "31536000",
              upsert: false,
              contentType: "image/jpeg",
            });

          if (!thumbnailUploadError) {
            const { data: thumbnailData } = supabase.storage
              .from("inspection-photos")
              .getPublicUrl(thumbnailPath);

            thumbnailUrl = thumbnailData.publicUrl;
          }
        }
      }

      setSaveLabel("Saving Finding...");

      const fullRecommendation = [
        recommendation,
        equipmentType ? `\n\nEquipment Type: ${equipmentType}` : "",
        manufacturer ? `Manufacturer: ${manufacturer}` : "",
        modelNumber ? `Model Number: ${modelNumber}` : "",
        serialNumber ? `Serial Number: ${serialNumber}` : "",
        estimatedAge ? `Estimated Age: ${estimatedAge}` : "",
        notes ? `Additional Notes: ${notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title,
          section,
          severity,
          observation,
          implication,
          recommendation: fullRecommendation,
          image_url: file?.type.startsWith("image/") ? imageUrl : "",
        })
        .select()
        .single();

      if (error) throw error;

      if (file && findingData) {
        setSaveLabel("Attaching Media...");

        const { error: photoError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          finding_id: findingData.id,
          public_url: imageUrl,
          file_path: filePath,
          thumbnail_url: thumbnailUrl || null,
          thumbnail_path: thumbnailPath || null,
        });

        if (photoError) throw photoError;
      }

      setSaveLabel("Opening Report...");
      showMessage("success", "Finding saved. Opening report...");
      window.location.assign(`/reports/${inspectionId}`);
    } catch (error: any) {
      setSaveLabel("Failed");
      showMessage(
        "error",
        error.message ||
          (photoType === "reference"
            ? "Failed to save reference photo."
            : "Failed to save finding."),
      );

      window.setTimeout(() => {
        setSaving(false);
        setSaveLabel(
          photoType === "reference"
            ? "Save Reference Photo"
            : "Save Finding to Report",
        );
      }, 700);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
              FLOW AI
            </p>

            <h1 className="mt-2 text-4xl font-extrabold">AI Capture</h1>

            <p className="mt-3 max-w-2xl text-[var(--fl-muted)]">
              Upload inspection photos, add your field note, and generate
              report-ready findings.
            </p>
          </div>

          <FastLinkButton
            href={inspectionId ? `/reports/${inspectionId}` : "/reports"}
            loadingText="Opening Report..."
            className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
          >
            Back To Report
          </FastLinkButton>
        </div>

        {message && (
          <div
            role="status"
            className={`rounded-xl border p-4 text-sm font-bold ${
              messageType === "success"
                ? "border-emerald-500 bg-emerald-500/10 text-[var(--fl-good-text)]"
                : "border-red-500 bg-red-500/10 text-[var(--fl-crit-text)]"
            }`}
          >
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6">
          <h2 className="mb-5 text-2xl font-bold text-[var(--fl-accent-text)]">
            Upload Photo
          </h2>

          <MediaUploadButtons
            onChange={handleFileChange}
            disabled={loading || saving}
          />

          {previewUrl && isImage && (
            <img
              src={previewUrl}
              alt="Preview"
              loading="lazy"
              decoding="async"
              className="mt-5 max-h-[450px] w-full rounded-xl border border-[var(--fl-line)] object-contain"
            />
          )}

          {previewUrl && isVideo && (
            <video
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              className="mt-5 max-h-[450px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
            />
          )}

          {file && (
            <p className="mt-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-muted)]">
              Selected: {file.name}{" "}
              {isVideo
                ? "• Video will be saved as report media. AI analysis is photo-only."
                : ""}
            </p>
          )}

          <textarea
            value={inspectorNote}
            onChange={(e) => setInspectorNote(e.target.value)}
            rows={4}
            disabled={loading || saving}
            placeholder="Optional note for AI... Example: loose toilet, damaged shingles, water staining under sink, missing GFCI, etc."
            className="mt-5 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <button
            type="button"
            onClick={analyzeImage}
            disabled={loading || saving}
            aria-busy={loading}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {isVideo ? "Videos Cannot Be Analyzed" : analyzeLabel}
          </button>
        </section>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6">
          <h2 className="mb-5 text-2xl font-bold text-[var(--fl-accent-text)]">AI Finding / Reference Photo</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              placeholder="Finding title"
              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
            />

            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              disabled={saving}
              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
            >
              {SECTIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <label className="block md:col-span-2">
              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
                Photo Type
              </p>

              <select
                value={photoType}
                onChange={(e) =>
                  setPhotoType(e.target.value as "finding" | "reference")
                }
                disabled={saving}
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="finding">Finding / Defect</option>
                <option value="reference">Section Reference Photo</option>
              </select>

              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                Reference photos save to this section only and are not counted as defects.
              </p>
            </label>

            {photoType === "finding" && (
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                disabled={saving}
                className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 md:col-span-2"
              >
                {SEVERITIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            )}
          </div>

          {photoType === "finding" ? (
            <>
              <TextArea
                label="Observation"
                value={observation}
                onChange={setObservation}
                disabled={saving}
              />

              <TextArea
                label="Implication"
                value={implication}
                onChange={setImplication}
                disabled={saving}
              />

              <TextArea
                label="Recommendation"
                value={recommendation}
                onChange={setRecommendation}
                disabled={saving}
              />
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-sm font-bold text-[var(--fl-info-text)]">
              This will save the selected image as a section reference photo only.
              It will not create a finding, defect, repair request item, or severity-counted issue.
              Use the optional field note above as the caption.
            </div>
          )}
        </section>

        {photoType === "finding" && (
          <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6">
            <h2 className="mb-5 text-2xl font-bold text-[var(--fl-accent-text)]">
              Equipment Recognition
            </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Equipment Type"
              value={equipmentType}
              onChange={setEquipmentType}
              disabled={saving}
            />

            <Input
              label="Manufacturer"
              value={manufacturer}
              onChange={setManufacturer}
              disabled={saving}
            />

            <Input
              label="Model Number"
              value={modelNumber}
              onChange={setModelNumber}
              disabled={saving}
            />

            <Input
              label="Serial Number"
              value={serialNumber}
              onChange={setSerialNumber}
              disabled={saving}
            />

            <Input
              label="Estimated Age"
              value={estimatedAge}
              onChange={setEstimatedAge}
              disabled={saving}
            />
          </div>

          <TextArea
            label="Equipment Notes"
            value={notes}
            onChange={setNotes}
            disabled={saving}
          />
          </section>
        )}

        <button
          type="button"
          onClick={saveFinding}
          disabled={saving || loading}
          aria-busy={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-4 text-lg font-extrabold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          {saving && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {saving
            ? saveLabel
            : photoType === "reference"
              ? "Save Reference Photo"
              : "Save Finding to Report"}
        </button>
      </div>
    </main>
  );
}

function MediaUploadButtons({
  onChange,
  disabled = false,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label
        className={`rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500 hover:text-black [touch-action:manipulation] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        📷 Take Photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onChange}
          disabled={disabled}
          className="hidden"
        />
      </label>

      <label
        className={`rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-black [touch-action:manipulation] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        🖼 Choose Photo
        <input
          type="file"
          accept="image/*"
          onChange={onChange}
          disabled={disabled}
          className="hidden"
        />
      </label>

      <label
        className={`rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white [touch-action:manipulation] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        🎥 Choose Video
        <input
          type="file"
          accept="video/*"
          onChange={onChange}
          disabled={disabled}
          className="hidden"
        />
      </label>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <textarea
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

async function createImageVariantForUpload(
  file: File,
  maxDimension: number,
  quality: number,
  suffix: string,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromDataUrl(originalDataUrl);

    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    const scale = Math.min(
      1,
      maxDimension / Math.max(originalWidth, originalHeight),
    );
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    const originalName = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${originalName}-${suffix}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

async function createFullImageForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(file, 1800, 0.8, "optimized");
}

async function createThumbnailForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(file, 480, 0.7, "thumb");
}

async function fileToBase64(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only photos can be analyzed by AI.");
  }

  const originalDataUrl = await readFileAsDataUrl(file);

  try {
    const image = await loadImageFromDataUrl(originalDataUrl);

    const maxDimension = 1600;

    const scale = Math.min(
      1,
      maxDimension /
        Math.max(
          image.naturalWidth || image.width,
          image.naturalHeight || image.height,
        ),
    );

    const width = Math.max(
      1,
      Math.round((image.naturalWidth || image.width) * scale),
    );

    const height = Math.max(
      1,
      Math.round((image.naturalHeight || image.height) * scale),
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to process image for AI.");
    }

    ctx.drawImage(image, 0, 0, width, height);

    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.82);

    if (!jpegDataUrl || !jpegDataUrl.startsWith("data:image/jpeg;base64,")) {
      throw new Error("Unable to convert image to JPEG.");
    }

    return jpegDataUrl;
  } catch {
    if (
      originalDataUrl.startsWith("data:image/jpeg") ||
      originalDataUrl.startsWith("data:image/png") ||
      originalDataUrl.startsWith("data:image/webp")
    ) {
      return originalDataUrl;
    }

    throw new Error(
      "This phone photo format could not be prepared for AI. Try taking a new photo inside the app or choose a JPG/PNG image.",
    );
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");

      if (!result.startsWith("data:image/")) {
        reject(new Error("Invalid image format."));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load image for processing."));
    image.src = dataUrl;
  });
}

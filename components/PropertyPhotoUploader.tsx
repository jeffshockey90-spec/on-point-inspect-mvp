"use client";

import { useRef, useState } from "react";

type PropertyPhotoUploaderProps = {
  inspectionId: string;
  returnTo: string;
};

const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.74;

function getMessage(errorCode: string) {
  switch (errorCode) {
    case "missing":
      return "Choose a property photo first.";
    case "type":
      return "That file type is not supported. Try taking a new photo.";
    case "size":
      return "That photo is still too large. Try taking a new photo a little farther away.";
    case "upload":
      return "The photo could not be uploaded. Try again.";
    case "save":
      return "The photo uploaded, but the report could not be updated.";
    default:
      return "The photo could not be uploaded. Try again.";
  }
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image could not be loaded."));
    };

    image.src = objectUrl;
  });
}

async function compressImageForUpload(file: File) {
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image.");

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) throw new Error("Could not compress image.");

  return new File([blob], `property-photo-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}

export default function PropertyPhotoUploader({
  inspectionId,
  returnTo,
}: PropertyPhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (uploading) return;

    const selectedFile = inputRef.current?.files?.[0];

    if (!selectedFile) {
      setError("Choose a property photo first.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      setStatus("Preparing photo...");

      const uploadFile = await compressImageForUpload(selectedFile);

      setStatus("Uploading photo...");

      const formData = new FormData();
      formData.append("property_photo", uploadFile);
      formData.append("inspection_id", inspectionId);
      formData.append("return_to", returnTo);
      formData.append("context", `inspection-${inspectionId}`);
      formData.append("ajax", "1");

      const response = await fetch("/api/property-photo/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(getMessage(result?.error || "upload"));
      }

      setStatus("Property photo updated.");
      window.location.href = result.redirectTo || `${returnTo}?property_photo_updated=1`;
    } catch (err: any) {
      console.error("Property photo upload failed:", err);
      setError(err?.message || "The photo could not be uploaded. Try again.");
      setStatus("");
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[var(--fl-line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--fl-accent-text)]">Property Photo</p>
          <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
            Take or upload the correct house photo. iPhone photos are compressed before upload.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            name="property_photo"
            accept="image/*"
            disabled={uploading}
            className="max-w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-xs font-bold text-[var(--fl-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-teal-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-teal-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Change Photo"}
          </button>
        </div>
      </div>

      {status && (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
          {status}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
          {error}
        </p>
      )}
    </form>
  );
}

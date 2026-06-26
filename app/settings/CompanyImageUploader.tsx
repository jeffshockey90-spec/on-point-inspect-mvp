"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  name: string;
  label: string;
  helper?: string;
  companyId: string;
  initialUrl?: string;
  folder: string;
  buttonText: string;
  previewClassName?: string;
};

type MessageType = "success" | "error" | "info" | "";

const STORAGE_BUCKET = "company-assets";

async function convertImageToJpeg(file: File): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image preview."));
    img.src = dataUrl;
  });

  const maxSize = 1200;
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSize / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.9);
  });

  if (!blob) throw new Error("Could not convert image.");

  return new File([blob], "company-image.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function safePathPart(value: any, fallback: string) {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || fallback;
}

export default function CompanyImageUploader({
  name,
  label,
  helper,
  companyId,
  initialUrl = "",
  folder,
  buttonText,
  previewClassName = "h-24 w-24 rounded-2xl border border-slate-700 bg-white object-contain p-2",
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const previewUrl = localPreviewUrl || url;

  useEffect(() => {
    setUrl(initialUrl || "");
    setLocalPreviewUrl("");
    setImageFailed(false);
  }, [initialUrl]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function uploadImage(file: File) {
    if (uploading) return;

    if (!file.type.startsWith("image/")) {
      showMessage("error", "Please choose an image file.");
      return;
    }

    setUploading(true);
    setImageFailed(false);
    showMessage("info", "Preparing image...");

    try {
      const preview = URL.createObjectURL(file);
      setLocalPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return preview;
      });

      const uploadFile = await convertImageToJpeg(file);

      const cleanCompanyId = safePathPart(companyId, "company");
      const cleanFolder = safePathPart(folder, "uploads");

      const filePath = `${cleanCompanyId}/${cleanFolder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.jpg`;

      showMessage("info", "Uploading image...");

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, uploadFile, {
          cacheControl: "31536000",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      if (!data?.publicUrl) {
        throw new Error("Upload finished but no public URL was returned.");
      }

      setUrl(data.publicUrl);
      setImageFailed(false);
      showMessage("success", "Image uploaded. Click Save Settings to keep it.");
    } catch (error: any) {
      setLocalPreviewUrl("");
      setImageFailed(true);
      showMessage(
        "error",
        error?.message ||
          "Image upload failed. Confirm the company-assets bucket exists and is public."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-4 md:col-span-2">
      <input type="hidden" name={name} value={url} />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            {label}
          </p>

          {helper && (
            <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
              {helper}
            </p>
          )}

          {url && (
            <div className="mt-3 rounded-xl border border-slate-800 bg-[#020617] p-3">
              <p className="text-xs font-bold text-emerald-300">
                Image selected
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                Uploaded image saved to settings field
              </p>
            </div>
          )}
        </div>

        {previewUrl && !imageFailed && (
          <img
            src={previewUrl}
            alt={label}
            loading="lazy"
            decoding="async"
            onError={() => {
              if (!localPreviewUrl) setImageFailed(true);
            }}
            className={previewClassName}
          />
        )}

        {url && imageFailed && (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-red-500/40 bg-red-950/20 p-3 text-center text-xs font-bold text-red-200">
            Saved, preview unavailable
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400 sm:w-auto">
          {uploading ? "Uploading..." : buttonText}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadImage(file);
              event.currentTarget.value = "";
            }}
            className="hidden"
          />
        </label>

        {url && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              setUrl("");
              setLocalPreviewUrl("");
              setImageFailed(false);
              showMessage("info", "Image cleared. Click Save Settings to keep this change.");
            }}
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
        )}
      </div>

      {message && (
        <p
          className={`mt-3 rounded-xl border px-4 py-3 text-xs font-bold ${
            messageType === "success"
              ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-200"
              : messageType === "info"
                ? "border-sky-500/50 bg-sky-950/30 text-sky-200"
                : "border-red-500/50 bg-red-950/30 text-red-200"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

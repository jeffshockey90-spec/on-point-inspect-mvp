"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  name: string;
  label: string;
  helper?: string;
  companyId: string;
  initialUrl?: string;
  initialUploadedAt?: string | null;
  folder: string;
  buttonText: string;
};

type MessageType = "success" | "error" | "info" | "";

const STORAGE_BUCKET = "company-assets";

function safePathPart(value: any, fallback: string) {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || fallback;
}

export default function CompanyDocumentUploader({
  name,
  label,
  helper,
  companyId,
  initialUrl = "",
  initialUploadedAt = null,
  folder,
  buttonText,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [uploadedAt, setUploadedAt] = useState(initialUploadedAt);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function uploadDocument(file: File) {
    if (uploading) return;

    if (file.type !== "application/pdf") {
      showMessage("error", "Please choose a PDF file.");
      return;
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      showMessage("error", "File is too large. Please upload a PDF under 10MB.");
      return;
    }

    setUploading(true);
    showMessage("info", "Uploading...");

    try {
      const cleanCompanyId = safePathPart(companyId, "company");
      const cleanFolder = safePathPart(folder, "documents");

      const filePath = `${cleanCompanyId}/${cleanFolder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "31536000",
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      if (!data?.publicUrl) {
        throw new Error("Upload finished but no public URL was returned.");
      }

      setUrl(data.publicUrl);
      setUploadedAt(new Date().toISOString());
      showMessage("success", "Uploaded. Click Save Settings to keep it.");
    } catch (error: any) {
      showMessage(
        "error",
        error?.message ||
          "Upload failed. Confirm the company-assets bucket exists and is public."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-4 md:col-span-2">
      <input type="hidden" name={name} value={url} />

      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>

      {helper && <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{helper}</p>}

      {url && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-[#020617] p-3">
          <p className="text-xs font-bold text-emerald-300">
            W9 on file{uploadedAt ? ` · uploaded ${new Date(uploadedAt).toLocaleDateString()}` : ""}
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-teal-300 underline underline-offset-2 hover:text-teal-200"
          >
            View current file
          </a>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400 sm:w-auto">
          {uploading ? "Uploading..." : buttonText}
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadDocument(file);
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
              setUploadedAt(null);
              showMessage("info", "Cleared. Click Save Settings to keep this change.");
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

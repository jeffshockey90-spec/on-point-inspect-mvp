"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  name: string;
  label: string;
  helper?: string;
  companyId: string;
  initialPath?: string;
  initialUploadedAt?: string | null;
  folder: string;
  buttonText: string;
};

type MessageType = "success" | "error" | "info" | "";

// Private bucket - a completed W9 has a real SSN/EIN in it, so unlike the
// company logo (company-assets, public) this must never be reachable by a
// guessable public URL. Access is view-only via short-lived signed URLs
// generated on demand, gated by storage RLS scoped to company membership
// (see supabase/add-company-documents-private-bucket.sql).
const STORAGE_BUCKET = "company-documents";

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
  initialPath = "",
  initialUploadedAt = null,
  folder,
  buttonText,
}: Props) {
  const [path, setPath] = useState(initialPath);
  const [uploadedAt, setUploadedAt] = useState(initialUploadedAt);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);
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
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      setPath(filePath);
      setUploadedAt(new Date().toISOString());
      showMessage("success", "Uploaded. Click Save Settings to keep it.");
    } catch (error: any) {
      showMessage(
        "error",
        error?.message ||
          "Upload failed. Confirm the company-documents storage bucket exists."
      );
    } finally {
      setUploading(false);
    }
  }

  async function viewCurrentFile() {
    if (viewing || !path) return;

    setViewing(true);

    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 300);

      if (error || !data?.signedUrl) {
        throw error || new Error("Could not create a link for this file.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      showMessage("error", error?.message || "Could not open the file.");
    } finally {
      setViewing(false);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 md:col-span-2">
      <input type="hidden" name={name} value={path} />

      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">{label}</p>

      {helper && <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--fl-faint)]">{helper}</p>}

      {path && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
          <p className="text-xs font-bold text-[var(--fl-good-text)]">
            W9 on file{uploadedAt ? ` · uploaded ${new Date(uploadedAt).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}` : ""}
          </p>
          <button
            type="button"
            onClick={viewCurrentFile}
            disabled={viewing}
            className="text-xs font-bold text-[var(--fl-accent-text)] underline underline-offset-2 hover:text-[var(--fl-accent-text)] disabled:opacity-60"
          >
            {viewing ? "Opening..." : "View / download current file"}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 sm:w-auto">
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

        {path && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              setPath("");
              setUploadedAt(null);
              showMessage("info", "Cleared. Click Save Settings to keep this change.");
            }}
            className="rounded-xl border border-[var(--fl-line)] px-5 py-3 text-sm font-bold text-[var(--fl-text)] transition hover:border-red-400 hover:text-[var(--fl-crit-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
        )}
      </div>

      {message && (
        <p
          className={`mt-3 rounded-xl border px-4 py-3 text-xs font-bold ${
            messageType === "success"
              ? "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]"
              : messageType === "info"
                ? "border-sky-500/50 bg-sky-500/10 text-[var(--fl-info-text)]"
                : "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

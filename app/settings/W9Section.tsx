"use client";

import { useState } from "react";
import CompanyDocumentUploader from "./CompanyDocumentUploader";
import W9FillModal from "./W9FillModal";
import { supabase } from "../../lib/supabaseClient";

type HistoryEntry = {
  id: number | string;
  storage_path: string;
  created_at: string;
};

const STORAGE_BUCKET = "company-documents";

function HistoryRow({ entry, isCurrent }: { entry: HistoryEntry; isCurrent: boolean }) {
  const [viewing, setViewing] = useState(false);
  const [error, setError] = useState("");

  async function view() {
    if (viewing) return;
    setViewing(true);
    setError("");

    try {
      const { data, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(entry.storage_path, 300);

      if (signError || !data?.signedUrl) throw signError || new Error("Could not open this file.");

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err?.message || "Could not open this file.");
    } finally {
      setViewing(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--fl-raised)] bg-[var(--fl-ground)] px-3 py-2">
      <div>
        <p className="text-xs font-bold text-[var(--fl-text)]">
          {new Date(entry.created_at).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          {isCurrent && (
            <span className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--fl-good-text)]">
              Current
            </span>
          )}
        </p>
        {error && <p className="mt-1 text-[11px] font-bold text-[var(--fl-crit-text)]">{error}</p>}
      </div>
      <button
        type="button"
        onClick={view}
        disabled={viewing}
        className="shrink-0 rounded-lg border border-teal-500/50 px-3 py-1.5 text-xs font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10 disabled:opacity-60"
      >
        {viewing ? "Opening..." : "View"}
      </button>
    </div>
  );
}

export default function W9Section({
  companyId,
  initialPath,
  initialUploadedAt,
  initialHistory,
}: {
  companyId: string;
  initialPath: string;
  initialUploadedAt: string | null;
  initialHistory: HistoryEntry[];
}) {
  const [path, setPath] = useState(initialPath);
  const [uploadedAt, setUploadedAt] = useState(initialUploadedAt);
  const [history, setHistory] = useState(initialHistory);

  return (
    <div className="min-w-0 space-y-3 md:col-span-2">
      <CompanyDocumentUploader
        key={path || "empty"}
        name="w9_document_url"
        label="W9 Form"
        helper="Upload your completed, signed W9 (PDF), or fill it out below. Kept privately - send it from any report's toolbar when a realtor or client requests one."
        companyId={companyId}
        initialPath={path}
        initialUploadedAt={uploadedAt}
        folder="documents"
        buttonText="Upload W9"
      />

      <W9FillModal
        onSaved={(result) => {
          setPath(result.path);
          setUploadedAt(result.uploadedAt);
          setHistory((prev) => [
            { id: `${result.path}-${result.uploadedAt}`, storage_path: result.path, created_at: result.uploadedAt },
            ...prev,
          ]);
        }}
      />

      {history.length > 0 && (
        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            W9 History ({history.length})
          </p>
          <div className="space-y-2">
            {history.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} isCurrent={entry.storage_path === path} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

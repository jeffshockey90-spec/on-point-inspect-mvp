"use client";

import { useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabaseClient";

type MoldTest = {
  air_samples?: number | null;
  surface_samples?: number | null;
  lab_name?: string | null;
  lab_report_url?: string | null;
  lab_status?: string | null;
  notes?: string | null;
  ai_remark?: string | null;
} | null;

type RadonTest = {
  average_pci?: number | null;
  device_name?: string | null;
  report_url?: string | null;
  report_status?: string | null;
  notes?: string | null;
} | null;

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
      />
    </label>
  );
}

// Lab report field: accepts EITHER a pasted link OR a PDF upload. Labs almost
// always send a PDF, so this uploads to the same public bucket used for photos
// and fills in the resulting link (which the client report already surfaces).
function LabReportField({
  inspectionId,
  kind,
  value,
  onChange,
  helper,
}: {
  inspectionId: string;
  kind: "mold" | "radon";
  value: string;
  onChange: (value: string) => void;
  helper: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Please choose a PDF file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That PDF is over 25 MB. Please use a smaller file.");
      return;
    }

    setError("");
    setUploading(true);
    try {
      const res = await fetch("/api/lab-report-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: String(inspectionId),
          kind,
          filename: file.name,
        }),
      });
      const info = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(info?.error || "Upload failed.");
      if (!info?.token || !info?.path) throw new Error("Could not start the upload.");

      const { error: uploadError } = await supabase.storage
        .from("lab-reports")
        .uploadToSignedUrl(info.path, info.token, file, {
          contentType: "application/pdf",
        });
      if (uploadError) throw uploadError;

      if (!info.url) throw new Error("Uploaded, but no link came back.");
      onChange(info.url);
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        Lab Report (upload PDF or paste a link)
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Upload the PDF, or paste a link"
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 rounded-lg border border-teal-500/50 px-3 py-2 text-sm font-bold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10 ${
            uploading ? "cursor-wait opacity-70" : "cursor-pointer"
          }`}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? "Uploading…" : "📄 Upload PDF"}
        </label>
        {value && !uploading ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-[var(--fl-accent-text)] underline"
          >
            View current
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs font-bold text-[var(--fl-crit-text)]">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-[var(--fl-faint)]">{helper}</p>
      )}
    </label>
  );
}

function MoldForm({
  inspectionId,
  initial,
}: {
  inspectionId: string;
  initial: MoldTest;
}) {
  const [airSamples, setAirSamples] = useState(String(initial?.air_samples ?? ""));
  const [surfaceSamples, setSurfaceSamples] = useState(
    String(initial?.surface_samples ?? "")
  );
  const [labName, setLabName] = useState(initial?.lab_name || "");
  const [labReportUrl, setLabReportUrl] = useState(initial?.lab_report_url || "");
  const [labStatus, setLabStatus] = useState(initial?.lab_status || "Pending Collection");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // AI client summary drafted from the uploaded lab report.
  const [aiRemark, setAiRemark] = useState(initial?.ai_remark || "");
  const [drafting, setDrafting] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);
  const [remarkMsg, setRemarkMsg] = useState<
    { type: "success" | "error" | "info"; text: string } | null
  >(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/mold-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_id: inspectionId,
          air_samples: airSamples,
          surface_samples: surfaceSamples,
          lab_name: labName,
          lab_report_url: labReportUrl,
          lab_status: labStatus,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to save mold test.");

      setMessage({ type: "success", text: "Mold test saved." });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to save mold test." });
    } finally {
      setSaving(false);
    }
  }

  // Have AI read the uploaded lab report PDF and draft a client-friendly summary.
  async function draftRemark() {
    if (drafting) return;
    setDrafting(true);
    setRemarkMsg(null);
    try {
      const res = await fetch("/api/ai/mold-remark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not draft the summary.");
      setAiRemark(data.remark || "");
      setRemarkMsg(
        data.saved === false
          ? {
              type: "info",
              text: "Draft ready. Run add-mold-ai-remark.sql so it saves to the client report.",
            }
          : { type: "success", text: "Draft ready — review/edit it, then Save Summary." },
      );
    } catch (error: any) {
      setRemarkMsg({ type: "error", text: error?.message || "Could not draft the summary." });
    } finally {
      setDrafting(false);
    }
  }

  // Persist the reviewed/edited summary so it shows on the client report.
  async function saveRemark() {
    if (savingRemark) return;
    setSavingRemark(true);
    setRemarkMsg(null);
    try {
      const res = await fetch("/api/mold-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspection_id: inspectionId, ai_remark: aiRemark }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the summary.");
      setRemarkMsg({ type: "success", text: "Client summary saved." });
    } catch (error: any) {
      setRemarkMsg({ type: "error", text: error?.message || "Could not save the summary." });
    } finally {
      setSavingRemark(false);
    }
  }

  // Remove the AI summary from the client report (reverts to the standard
  // auto-generated mold blurb).
  async function removeRemark() {
    if (savingRemark) return;
    setSavingRemark(true);
    setRemarkMsg(null);
    try {
      const res = await fetch("/api/mold-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspection_id: inspectionId, ai_remark: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove the summary.");
      setAiRemark("");
      setRemarkMsg({ type: "success", text: "Summary removed — the client report shows the standard mold blurb." });
    } catch (error: any) {
      setRemarkMsg({ type: "error", text: error?.message || "Could not remove the summary." });
    } finally {
      setSavingRemark(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <h3 className="mb-4 text-xl font-bold text-[var(--fl-purple-text)]">Mold Test</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Air Samples" value={airSamples} onChange={setAirSamples} />
        <Field label="Surface/Tape/Swab Samples" value={surfaceSamples} onChange={setSurfaceSamples} />
        <Field label="Lab Name" value={labName} onChange={setLabName} />

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Lab Status
          </span>
          <select
            value={labStatus}
            onChange={(e) => setLabStatus(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          >
            <option value="Pending Collection">Pending Collection</option>
            <option value="Pending">Pending Lab Results</option>
            <option value="Normal">Normal / Not Elevated</option>
            <option value="Action Recommended">Elevated / Action Recommended</option>
          </select>
        </label>

        <div className="md:col-span-2">
          <LabReportField
            inspectionId={inspectionId}
            kind="mold"
            value={labReportUrl}
            onChange={setLabReportUrl}
            helper={'Shows as "View Official Mold Lab Report" on the client report. Remember to Save Mold Test.'}
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-teal-500/40 bg-teal-500/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-[var(--fl-accent-text)]">
              AI Client Summary
            </h4>
            <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
              Upload the lab report above, then have AI read it and draft a clean,
              plain-English summary for the client. Review and edit it, then Save —
              it shows in the Mold section of the client&apos;s report.
            </p>
          </div>
          <button
            type="button"
            onClick={draftRemark}
            disabled={drafting || !labReportUrl.trim()}
            className="shrink-0 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {drafting ? "Reading report…" : "🧠 Draft from Lab Report"}
          </button>
        </div>

        {!labReportUrl.trim() && (
          <p className="mt-2 text-xs font-semibold text-[var(--fl-warn-text)]">
            Upload the lab report PDF first (and Save Mold Test).
          </p>
        )}

        <textarea
          value={aiRemark}
          onChange={(e) => setAiRemark(e.target.value)}
          rows={6}
          placeholder="The AI-drafted summary appears here for you to review and edit — or type your own."
          className="mt-3 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 leading-7 text-[var(--fl-text)] outline-none focus:border-teal-400"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveRemark}
            disabled={savingRemark}
            className="rounded-xl border border-teal-500 bg-teal-500/10 px-4 py-2.5 text-sm font-bold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-slate-950 disabled:opacity-50"
          >
            {savingRemark ? "Saving…" : "Save Summary"}
          </button>
          {aiRemark.trim() && (
            <button
              type="button"
              onClick={removeRemark}
              disabled={savingRemark}
              className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-[var(--fl-crit-text)] transition hover:bg-red-500/20 disabled:opacity-50"
            >
              Remove
            </button>
          )}
          {remarkMsg && (
            <span
              className={`text-sm font-bold ${
                remarkMsg.type === "success"
                  ? "text-[var(--fl-good-text)]"
                  : remarkMsg.type === "info"
                    ? "text-[var(--fl-warn-text)]"
                    : "text-[var(--fl-crit-text)]"
              }`}
            >
              {remarkMsg.text}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl border border-purple-500 bg-purple-500/10 px-5 py-3 font-bold text-[var(--fl-purple-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500 hover:text-slate-950"
        >
          {saving ? "Saving..." : "Save Mold Test"}
        </button>

        {message && (
          <span
            className={`text-sm font-bold ${
              message.type === "success" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
            }`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

// Classify a radon average against the EPA action level (4.0 pCi/L). Shown live
// as the inspector types, so they instantly see whether it's elevated.
function radonLevel(avgRaw: string) {
  const v = Number(String(avgRaw ?? "").replace(/[^0-9.]/g, ""));
  if (!v || !Number.isFinite(v)) {
    return {
      label: "Enter a value",
      cls: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]",
      note: "Enter the average pCi/L above and this updates automatically.",
    };
  }
  if (v >= 4) {
    return {
      label: "Elevated — Action Recommended",
      cls: "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]",
      note: "At or above the EPA action level of 4.0 pCi/L. Mitigation by a qualified radon contractor is recommended.",
    };
  }
  if (v >= 2) {
    return {
      label: "Monitor",
      cls: "border-amber-500/50 bg-amber-500/10 text-[var(--fl-warn-text)]",
      note: "Below the 4.0 pCi/L action level but at or above 2.0. Continued monitoring or consultation may be considered.",
    };
  }
  return {
    label: "Low / Normal",
    cls: "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]",
    note: "Below the EPA action level of 4.0 pCi/L.",
  };
}

function RadonForm({
  inspectionId,
  initial,
}: {
  inspectionId: string;
  initial: RadonTest;
}) {
  const [averagePci, setAveragePci] = useState(String(initial?.average_pci ?? ""));
  const [deviceName, setDeviceName] = useState(initial?.device_name || "");
  const [reportUrl, setReportUrl] = useState(initial?.report_url || "");
  const [reportStatus, setReportStatus] = useState(initial?.report_status || "Pending");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/radon-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_id: inspectionId,
          average_pci: averagePci,
          device_name: deviceName,
          report_url: reportUrl,
          report_status: reportStatus,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to save radon test.");

      setMessage({ type: "success", text: "Radon test saved." });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to save radon test." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <h3 className="mb-4 text-xl font-bold text-[var(--fl-purple-text)]">Radon Test</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Average pCi/L" value={averagePci} onChange={setAveragePci} />
        <Field label="Device Name" value={deviceName} onChange={setDeviceName} />

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Report Status
          </span>
          <select
            value={reportStatus}
            onChange={(e) => setReportStatus(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          >
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>
        </label>

        {(() => {
          const level = radonLevel(averagePci);
          return (
            <div className="md:col-span-2 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Radon Level
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${level.cls}`}>
                  {level.label}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--fl-muted)]">{level.note}</p>
              <p className="mt-1 text-[11px] text-[var(--fl-faint)]">
                Auto-calculated from the average above. EPA action level: 4.0 pCi/L.
              </p>
            </div>
          );
        })()}

        <div className="md:col-span-2">
          <LabReportField
            inspectionId={inspectionId}
            kind="radon"
            value={reportUrl}
            onChange={setReportUrl}
            helper={'Shows as "View Official Radon Device Report" on the client report. Remember to Save Radon Test.'}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl border border-purple-500 bg-purple-500/10 px-5 py-3 font-bold text-[var(--fl-purple-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500 hover:text-slate-950"
        >
          {saving ? "Saving..." : "Save Radon Test"}
        </button>

        {message && (
          <span
            className={`text-sm font-bold ${
              message.type === "success" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
            }`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

// Post the results to the client + realtor. Reuses /api/send-report-email,
// which emails AND texts both parties (role-aware) and includes the
// environmental report links.
function NotifyButton({ inspectionId }: { inspectionId: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  async function notify() {
    if (sending) return;
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, recipientType: "all", context: "environmental" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send.");
      const count = Array.isArray(data?.sent) ? data.sent.length : undefined;
      setMessage({
        type: "success",
        text:
          count != null
            ? `Sent to ${count} recipient${count === 1 ? "" : "s"} by email + text.`
            : "Results sent to your client and realtor by email + text.",
      });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Failed to send." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
        Alert everyone
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">
        Save your results above first, then send your client and realtor the report link by
        email and text.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={notify}
          disabled={sending}
          className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-wait disabled:opacity-60"
        >
          {sending ? "Sending…" : "📣 Notify Client & Realtor"}
        </button>
        {message && (
          <span
            className={`text-sm font-bold ${
              message.type === "success" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
            }`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function EnvironmentalTestPanel({
  inspectionId,
  hasMold,
  hasRadon,
  moldTest,
  radonTest,
}: {
  inspectionId: string;
  hasMold: boolean;
  hasRadon: boolean;
  moldTest: MoldTest;
  radonTest: RadonTest;
}) {
  return (
    <div className="space-y-4">
      {hasMold && <MoldForm inspectionId={inspectionId} initial={moldTest} />}
      {hasRadon && <RadonForm inspectionId={inspectionId} initial={radonTest} />}
      {(hasMold || hasRadon) && <NotifyButton inspectionId={inspectionId} />}
    </div>
  );
}

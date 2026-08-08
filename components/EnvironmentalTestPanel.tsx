"use client";

import { useState, type ChangeEvent } from "react";

type MoldTest = {
  air_samples?: number | null;
  surface_samples?: number | null;
  lab_name?: string | null;
  lab_report_url?: string | null;
  lab_status?: string | null;
  notes?: string | null;
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
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
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
      const fd = new FormData();
      fd.append("file", file);
      fd.append("inspectionId", String(inspectionId));
      fd.append("kind", kind);

      const res = await fetch("/api/lab-report-upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      if (!data?.url) throw new Error("Upload succeeded but no link came back.");

      onChange(data.url);
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
        Lab Report (upload PDF or paste a link)
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Upload the PDF, or paste a link"
        className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 rounded-lg border border-teal-500/50 px-3 py-2 text-sm font-bold text-teal-300 transition hover:bg-teal-500/10 ${
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
            className="text-sm font-bold text-teal-400 underline"
          >
            View current
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs font-bold text-red-400">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">{helper}</p>
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

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224] p-4">
      <h3 className="mb-4 text-xl font-bold text-purple-300">Mold Test</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Air Samples" value={airSamples} onChange={setAirSamples} />
        <Field label="Surface/Tape/Swab Samples" value={surfaceSamples} onChange={setSurfaceSamples} />
        <Field label="Lab Name" value={labName} onChange={setLabName} />

        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
            Lab Status
          </span>
          <select
            value={labStatus}
            onChange={(e) => setLabStatus(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
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

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl border border-purple-500 bg-purple-500/10 px-5 py-3 font-bold text-purple-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500 hover:text-slate-950"
        >
          {saving ? "Saving..." : "Save Mold Test"}
        </button>

        {message && (
          <span
            className={`text-sm font-bold ${
              message.type === "success" ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
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
    <div className="rounded-2xl border border-slate-700 bg-[#071224] p-4">
      <h3 className="mb-4 text-xl font-bold text-purple-300">Radon Test</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Average pCi/L" value={averagePci} onChange={setAveragePci} />
        <Field label="Device Name" value={deviceName} onChange={setDeviceName} />

        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
            Report Status
          </span>
          <select
            value={reportStatus}
            onChange={(e) => setReportStatus(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
          >
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>
        </label>

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
          className="rounded-xl border border-purple-500 bg-purple-500/10 px-5 py-3 font-bold text-purple-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500 hover:text-slate-950"
        >
          {saving ? "Saving..." : "Save Radon Test"}
        </button>

        {message && (
          <span
            className={`text-sm font-bold ${
              message.type === "success" ? "text-emerald-300" : "text-red-300"
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
    </div>
  );
}

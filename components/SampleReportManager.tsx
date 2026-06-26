"use client";

import { useEffect, useState } from "react";

function getAbsoluteUrl(value: string) {
  if (typeof window === "undefined") return value;

  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

  return `${window.location.origin}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

export default function SampleReportManager({
  inspectionId,
  initialEnabled = false,
  initialTitle = "",
  initialDescription = "",
  shareUrl = "",
}: {
  inspectionId: string;
  initialEnabled?: boolean;
  initialTitle?: string;
  initialDescription?: string;
  shareUrl?: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // IMPORTANT:
  // Keep this value stable between server render and client hydration.
  // Do not use window.location here, or Next will throw a hydration mismatch.
  const publicShareUrl = String(shareUrl || `/share/${inspectionId}`).trim();

  useEffect(() => {
    setEnabled(initialEnabled);
    setTitle(initialTitle);
    setDescription(initialDescription);
  }, [initialEnabled, initialTitle, initialDescription]);

  async function saveSampleReport() {
    if (saving) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/sample-reports/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          enabled,
          title,
          description,
          // Store the same stable URL that was rendered. This avoids hydration
          // issues and still works as an internal public link.
          shareUrl: publicShareUrl,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || "Unable to save sample report settings.",
        );
      }

      setMessage(
        enabled
          ? "Sample report is now visible on your public profile."
          : "Sample report is hidden from your public profile.",
      );
    } catch (err: any) {
      setError(err?.message || "Unable to save sample report settings.");
    } finally {
      setSaving(false);
    }
  }

  async function shareReport() {
    if (!publicShareUrl) return;

    const absoluteUrl = getAbsoluteUrl(publicShareUrl);

    if (navigator.share) {
      try {
        await navigator.share({
          title: title || "Sample inspection report",
          text: description || "View this sample inspection report.",
          url: absoluteUrl,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(absoluteUrl || publicShareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <section className="mb-8 rounded-2xl border border-teal-500/40 bg-teal-950/20 p-4 shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
            Public Profile Marketing
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Sample Report
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Feature this report on your public inspector profile so clients and
            realtors can preview the quality of your work.
          </p>
        </div>

        <span
          className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${
            enabled
              ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
              : "border-slate-600 bg-slate-900 text-slate-400"
          }`}
        >
          {enabled ? "Visible on Profile" : "Not Public"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <label className="flex gap-4 rounded-2xl border border-slate-700 bg-[#020817] p-4">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-teal-400"
          />
          <span>
            <span className="block font-black text-white">
              Show on public profile
            </span>
            <span className="mt-1 block text-sm leading-6 text-slate-400">
              Adds this report to the Sample Reports section of your public
              profile.
            </span>
          </span>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block min-w-0">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
              Sample Report Title
            </p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Buyer Inspection Sample"
              className="w-full rounded-xl border border-slate-700 bg-[#020817] p-3 text-white outline-none focus:border-teal-400"
            />
          </label>

          <label className="block min-w-0">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
              Short Description
            </p>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Example: Full residential inspection with photos and summary."
              className="w-full rounded-xl border border-slate-700 bg-[#020817] p-3 text-white outline-none focus:border-teal-400"
            />
          </label>
        </div>
      </div>

      {publicShareUrl && (
        <p className="mt-4 break-all rounded-xl border border-slate-700 bg-[#020817] p-3 text-xs font-bold text-slate-300">
          Public sample link: {publicShareUrl}
        </p>
      )}

      {message && (
        <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm font-bold text-emerald-300">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={saveSampleReport}
          disabled={saving}
          className="inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving..." : "Save Sample Report Settings"}
        </button>

        <button
          type="button"
          onClick={shareReport}
          disabled={!publicShareUrl}
          className="inline-flex w-full items-center justify-center rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {copied ? "Copied Link" : "Share / Copy Sample Link"}
        </button>
      </div>
    </section>
  );
}

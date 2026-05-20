"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../../components/Nav";
import { Card } from "../../components/Card";
import { FormField, inputClass } from "../../components/FormField";
import { supabase } from "../../lib/supabase";
import type { Inspection } from "../../lib/types";

const bucketName = "inspection-photos";

export default function AiCapturePage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [inspectionId, setInspectionId] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadInspections();
  }, []);

  async function loadInspections() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const { data } = await supabase
      .from("inspections")
      .select("*, clients(*), realtors(*)")
      .order("created_at", { ascending: false });
    setInspections((data || []) as Inspection[]);
    if (data?.[0]?.id) setInspectionId(data[0].id);
  }

  async function captureAndRoute(file: File) {
    if (!inspectionId) {
      setMessage("Choose an inspection first.");
      return;
    }
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
      const tempPath = `${inspectionId}/ai-capture/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(tempPath, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(tempPath);

      const aiRes = await fetch("/api/ai/photo-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: urlData.publicUrl,
          caption,
          currentSection: "Unknown",
        }),
      });
      const ai = await aiRes.json();
      if (!aiRes.ok) throw new Error(ai.error || "AI photo routing failed.");

      const { data: finding, error: findingError } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          section_name: ai.suggested_section || "General Information",
          title: ai.suggested_title || ai.defect_summary || "AI Photo Finding",
          observation: ai.observation || "",
          implication: ai.implication || "",
          recommendation: ai.recommendation || "",
          severity: ai.severity || "recommendation",
          status: "open",
        })
        .select()
        .single();
      if (findingError) throw findingError;

      const { data: photo, error: photoError } = await supabase
        .from("photos")
        .insert({
          finding_id: finding.id,
          inspection_id: inspectionId,
          storage_path: tempPath,
          public_url: urlData.publicUrl,
          caption,
          ai_section_suggestion: ai.suggested_section,
          ai_defect_summary: ai.defect_summary,
          ai_confidence: ai.confidence,
          ai_review_status: "auto_created_pending_human_review",
        })
        .select()
        .single();
      if (photoError) throw photoError;

      await supabase.from("ai_photo_reviews").insert({
        photo_id: photo.id,
        inspection_id: inspectionId,
        finding_id: finding.id,
        suggested_section: ai.suggested_section,
        suggested_title: ai.suggested_title,
        observation: ai.observation,
        implication: ai.implication,
        recommendation: ai.recommendation,
        severity: ai.severity,
        confidence: ai.confidence,
        raw_response: ai,
      });

      setResult({ finding, photo, ai });
      setCaption("");
      setMessage(
        "Photo routed and finding created. Review it before publishing the report.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not route photo.");
    } finally {
      setBusy(false);
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-4xl p-6">
          <Card title="Setup Needed">
            <p>Add Supabase keys to .env.local first.</p>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">AI Photo Capture</h1>
          <p className="mt-2 text-slate-300">
            Take or upload a defect photo. AI will suggest the report section,
            draft the finding, and attach the photo automatically.
          </p>
        </div>

        <Card title="Capture + Auto Route">
          <div className="space-y-4">
            <FormField label="Inspection">
              <select
                className={inputClass}
                value={inspectionId}
                onChange={(e) => setInspectionId(e.target.value)}
              >
                {inspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    {inspection.property_address}{" "}
                    {inspection.inspection_date
                      ? `• ${inspection.inspection_date}`
                      : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Optional note/caption">
              <textarea
                className={`${inputClass} h-20`}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Example: basement crawlspace, open splice near junction box"
              />
            </FormField>
            <label className="inline-block cursor-pointer rounded-xl bg-onpoint-teal px-5 py-3 font-bold text-black">
              {busy ? "Routing photo..." : "Take / Upload Defect Photo"}
              <input
                className="hidden"
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(e) =>
                  e.target.files?.[0] && captureAndRoute(e.target.files[0])
                }
              />
            </label>
            {message && (
              <p className="rounded-lg bg-white/10 p-3 text-sm">{message}</p>
            )}
          </div>
        </Card>

        {result && (
          <Card title="Created Finding">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.photo.public_url}
                alt="Routed inspection photo"
                className="h-44 w-full rounded-xl object-cover"
              />
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Section:</strong> {result.ai.suggested_section} •{" "}
                  <strong>Confidence:</strong>{" "}
                  {Math.round((result.ai.confidence || 0) * 100)}%
                </p>
                <p>
                  <strong>Title:</strong> {result.finding.title}
                </p>
                <p>
                  <strong>Observation:</strong> {result.finding.observation}
                </p>
                <p>
                  <strong>Recommendation:</strong>{" "}
                  {result.finding.recommendation}
                </p>
                <Link
                  href={`/reports/${inspectionId}`}
                  className="inline-block rounded-lg bg-onpoint-teal px-4 py-2 font-bold text-black"
                >
                  Open Report & Review
                </Link>
              </div>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

type Finding = Record<string, any>;
type Inspection = Record<string, any>;

function getSeverityStyle(severity: string) {
  const clean = String(severity || "Recommended Repair").toLowerCase();

  if (clean.includes("safety") || clean.includes("hazard") || clean.includes("major")) {
    return "border-red-500/60 bg-red-500/10 text-red-300";
  }

  if (clean.includes("maintenance") || clean.includes("monitor") || clean.includes("minor")) {
    return "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  if (clean.includes("information") || clean.includes("info")) {
    return "border-blue-500/60 bg-blue-500/10 text-blue-300";
  }

  return "border-teal-500/60 bg-teal-500/10 text-teal-300";
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";
  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.substring(index + marker.length));
}

function isRepairFinding(finding: Finding) {
  const section = String(finding.section || "").toLowerCase();
  const title = String(finding.title || "").toLowerCase();

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;

  const excluded = [
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ];

  return !excluded.includes(title);
}

function RepairRequestContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id");
  const supabase = createClient();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddendum, setShowAddendum] = useState(false);

  useEffect(() => {
    async function trackRepairRequestView() {
      if (!inspectionId) return;

      try {
        await fetch("/api/track-inspection-view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_id: inspectionId,
            view_type: "repair_request",
            viewer_role: "client",
            path: `/repair-request?inspection_id=${inspectionId}`,
          }),
        });
      } catch (error) {
        console.error("Repair request tracking error:", error);
      }
    }

    trackRepairRequestView();
  }, [inspectionId]);

  const [requestIntro, setRequestIntro] = useState(
    "The following items are requested for repair, correction, evaluation, or further review by qualified professionals prior to closing, unless otherwise negotiated by the parties involved."
  );

  useEffect(() => {
    async function loadData() {
      if (!inspectionId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data: inspectionData } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .single();

      setInspection(inspectionData || null);

      const { data: findingsRaw } = await supabase
        .from("findings")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });

      const filteredFindings = (findingsRaw || []).filter(isRepairFinding);
      const findingIds = filteredFindings.map((finding: any) => finding.id);

      const { data: photosRaw } =
        findingIds.length > 0
          ? await supabase.from("photos").select("*").in("finding_id", findingIds)
          : { data: [] };

      const photosWithUrls = await Promise.all(
        (photosRaw || []).map(async (photo: any) => {
          const filePath =
            photo.file_path ||
            photo.storage_path ||
            photo.photo_path ||
            getStoragePathFromUrl(photo.public_url) ||
            getStoragePathFromUrl(photo.image_url) ||
            getStoragePathFromUrl(photo.photo_url);

          if (!filePath) {
            return {
              ...photo,
              signed_url:
                photo.signed_url ||
                photo.public_url ||
                photo.image_url ||
                photo.photo_url ||
                "",
            };
          }

          const { data } = await supabase.storage
            .from("inspection-photos")
            .createSignedUrl(filePath, 60 * 60 * 24 * 7);

          return {
            ...photo,
            signed_url:
              data?.signedUrl ||
              photo.signed_url ||
              photo.public_url ||
              photo.image_url ||
              photo.photo_url ||
              "",
          };
        })
      );

      const photosByFindingId = photosWithUrls.reduce(
        (acc: Record<string, any[]>, photo: any) => {
          if (!photo.finding_id) return acc;
          if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
          acc[photo.finding_id].push(photo);
          return acc;
        },
        {}
      );

      const hydratedFindings = filteredFindings.map((finding: any) => ({
        ...finding,
        photos: photosByFindingId[finding.id] || [],
      }));

      setFindings(hydratedFindings);
      setSelectedIds([]);
      setLoading(false);
    }

    loadData();
  }, [inspectionId, supabase]);

  const selectedFindings = useMemo(
    () => findings.filter((finding) => selectedIds.includes(finding.id)),
    [findings, selectedIds]
  );

  const groupedFindings = useMemo(() => {
    return selectedFindings.reduce((acc: Record<string, Finding[]>, finding) => {
      const section = finding.section || "Other";
      if (!acc[section]) acc[section] = [];
      acc[section].push(finding);
      return acc;
    }, {});
  }, [selectedFindings]);

  const realtorSummary = useMemo(() => {
    if (selectedFindings.length === 0) {
      return "No repair request items have been selected yet.";
    }

    const safetyCount = selectedFindings.filter((finding) => {
      const severity = String(finding.severity || "").toLowerCase();
      return severity.includes("safety") || severity.includes("hazard") || severity.includes("major");
    }).length;

    const sections = Array.from(
      new Set(selectedFindings.map((finding) => finding.section || "Other"))
    ).join(", ");

    return `The buyer respectfully requests correction, repair, evaluation, or further negotiation of ${selectedFindings.length} inspection item(s) identified in the inspection report. ${
      safetyCount > 0
        ? `${safetyCount} item(s) appear to involve safety, major, or higher-priority concerns. `
        : ""
    }The selected items are grouped under the following inspection sections: ${sections}. This repair request summary is intended to assist the parties in negotiating repairs, credits, licensed contractor evaluation, or other mutually agreed resolutions prior to closing.`;
  }, [selectedFindings]);

  function toggleFinding(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function selectSafetyOnly() {
    const safetyIds = findings
      .filter((finding) => {
        const severity = String(finding.severity || "").toLowerCase();
        return severity.includes("safety") || severity.includes("hazard") || severity.includes("major");
      })
      .map((finding) => finding.id);

    setSelectedIds(safetyIds);
  }

  function emailRepairRequest() {
    const property = inspection?.property_address || inspection?.address || "Inspection Property";
    const subject = encodeURIComponent(`Repair Request Summary - ${property}`);
    const body = encodeURIComponent(
      `Hello,\n\nAttached/linked is the repair request summary for ${property}.\n\n${realtorSummary}\n\nPlease review the requested repair/correction items and advise on next steps.\n\nOn Point Home Inspections LLC`
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  if (!inspectionId) {
    return (
      <main className="min-h-screen bg-[#020617] p-8 text-white">
        <h1 className="text-3xl font-black text-teal-400">Repair Request Builder</h1>
        <p className="mt-4 text-slate-300">Missing inspection ID.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] p-8 text-white">
        Loading repair request...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap gap-3 print:hidden">
          <Link
            href={`/reports/${inspectionId}`}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white hover:bg-slate-800"
          >
            Back to Report
          </Link>

          <button
            onClick={() => window.print()}
            className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
          >
            Share Repair Request PDF
          </button>

          <button
            onClick={emailRepairRequest}
            className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
          >
            Email Repair Request
          </button>

          <button
            onClick={() => setShowAddendum(!showAddendum)}
            className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10"
          >
            {showAddendum ? "Hide Addendum" : "Export Negotiation Addendum"}
          </button>

          <button
            onClick={() => setSelectedIds(findings.map((finding) => finding.id))}
            className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
          >
            Select All
          </button>

          <button
            onClick={() => setSelectedIds([])}
            className="rounded-xl border border-red-500 px-5 py-3 font-bold text-red-300 hover:bg-red-500/10"
          >
            Clear All
          </button>

          <button
            onClick={selectSafetyOnly}
            className="rounded-xl border border-orange-500 px-5 py-3 font-bold text-orange-300 hover:bg-orange-500/10"
          >
            Safety Only
          </button>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 text-4xl font-black text-white">
            Repair Request Summary
          </h1>

          <p className="mt-3 text-slate-300">
            {inspection?.property_address || inspection?.address || "Property address not entered"}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Info label="Client" value={inspection?.client_name} />
            <Info label="Realtor" value={inspection?.realtor_name} />
            <Info label="Date" value={inspection?.inspection_date} />
            <Info label="Selected Items" value={selectedFindings.length} />
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-teal-500/30 bg-[#071224] p-6">
          <h2 className="mb-3 text-2xl font-bold text-teal-300">
            Generate Realtor Summary
          </h2>

          <div className="rounded-xl border border-slate-700 bg-[#020617] p-4 text-slate-200">
            <p className="whitespace-pre-line leading-7">{realtorSummary}</p>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-[#071224] p-6">
          <h2 className="mb-3 text-2xl font-bold text-teal-300">
            Request Language
          </h2>

          <textarea
            value={requestIntro}
            onChange={(e) => setRequestIntro(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-700 bg-[#020617] p-4 text-white"
          />
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 print:hidden">
          <h2 className="mb-4 text-2xl font-bold text-teal-300">
            Select Findings
          </h2>

          <div className="space-y-3">
            {findings.map((finding) => (
              <label
                key={finding.id}
                className="flex cursor-pointer items-start gap-4 rounded-xl border border-slate-700 bg-[#020617] p-4 hover:border-teal-500"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(finding.id)}
                  onChange={() => toggleFinding(finding.id)}
                  className="mt-1 h-5 w-5 accent-teal-400"
                />

                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${getSeverityStyle(
                        finding.severity
                      )}`}
                    >
                      {finding.severity || "Recommended Repair"}
                    </span>

                    <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-bold uppercase text-slate-300">
                      {finding.section}
                    </span>
                  </div>

                  <p className="font-bold text-white">{finding.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                    {finding.recommendation || finding.observation}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {showAddendum && (
          <section className="mb-8 rounded-2xl border border-purple-500/40 bg-white p-6 text-black">
            <h2 className="mb-4 text-3xl font-black text-slate-950">
              Negotiation Addendum Draft
            </h2>

            <p className="mb-6 leading-7 text-slate-700">
              Buyer requests that seller address the following inspection items by repair, licensed contractor evaluation, replacement, seller credit, or other mutually agreed resolution.
            </p>

            <div className="space-y-4">
              {selectedFindings.map((finding, index) => (
                <div key={finding.id} className="rounded-xl border border-slate-300 p-4">
                  <p className="font-black text-slate-950">
                    {index + 1}. {finding.title}
                  </p>
                  <p className="mt-2 text-slate-700">
                    Requested Action: {finding.recommendation || finding.observation || "Further evaluation/repair requested."}
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-300 p-3">Seller to Repair ☐</div>
                    <div className="rounded-lg border border-slate-300 p-3">Credit Offered ☐</div>
                    <div className="rounded-lg border border-slate-300 p-3">Further Evaluation ☐</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <p className="font-bold">Buyer Signature:</p>
                <div className="mt-10 border-b border-slate-500" />
              </div>
              <div>
                <p className="font-bold">Seller Response / Signature:</p>
                <div className="mt-10 border-b border-slate-500" />
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-white p-6 text-black">
          <h2 className="mb-4 text-3xl font-black text-slate-950">
            Requested Repairs / Corrections
          </h2>

          <p className="mb-8 leading-7 text-slate-700">{requestIntro}</p>

          {selectedFindings.length === 0 ? (
            <p>No findings selected.</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedFindings).map(([section, items]) => (
                <div key={section}>
                  <h3 className="mb-4 border-b border-slate-300 pb-2 text-2xl font-black text-slate-950">
                    {section}
                  </h3>

                  <div className="space-y-5">
                    {items.map((finding, index) => {
                      const firstPhoto = finding.photos?.[0];

                      return (
                        <article
                          key={finding.id}
                          className="break-inside-avoid rounded-xl border border-slate-300 p-5"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-xl font-black text-slate-950">
                              {index + 1}. {finding.title}
                            </h4>

                            <span className="rounded-full border border-slate-400 px-3 py-1 text-xs font-bold uppercase text-slate-700">
                              {finding.severity || "Recommended Repair"}
                            </span>
                          </div>

                          {firstPhoto?.signed_url && (
                            <img
                              src={firstPhoto.signed_url}
                              alt="Finding"
                              className="mb-4 max-h-[320px] w-full rounded-lg border border-slate-300 object-contain"
                            />
                          )}

                          {finding.observation && (
                            <ReportText title="Observation" text={finding.observation} />
                          )}

                          {finding.implication && (
                            <ReportText title="Implication" text={finding.implication} />
                          )}

                          {finding.recommendation && (
                            <ReportText title="Requested Action" text={finding.recommendation} />
                          )}

                          <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
                            <p className="font-bold text-slate-900">
                              Seller Response Section:
                            </p>

                            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-4">
                              <span>Completed ☐</span>
                              <span>Declined ☐</span>
                              <span>Credit Offered ☐</span>
                              <span>Receipt Provided ☐</span>
                            </div>

                            <p className="mt-4 font-bold text-slate-900">
                              Notes:
                            </p>
                            <div className="mt-10 border-b border-slate-400" />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function RepairRequestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#020617] p-8 text-white">
          Loading repair request...
        </main>
      }
    >
      <RepairRequestContent />
    </Suspense>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020617] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-white">{value || "N/A"}</p>
    </div>
  );
}

function ReportText({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-3">
      <p className="font-black text-slate-950">{title}:</p>
      <p className="mt-1 whitespace-pre-line leading-7 text-slate-700">{text}</p>
    </div>
  );
}
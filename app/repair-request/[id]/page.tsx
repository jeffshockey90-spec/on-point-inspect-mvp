"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

export default function RepairRequestPage() {
  const params = useParams();

  const [inspection, setInspection] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRepairRequest();
  }, []);

  async function loadRepairRequest() {
    const inspectionId = params.id;

    const { data: inspectionData } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    const { data: findingsData } = await supabase
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId)
      .eq("repair_request", true);

    const { data: photosData } = await supabase
      .from("photos")
      .select("*")
      .eq("inspection_id", inspectionId);

    setInspection(inspectionData);
    setFindings(findingsData || []);
    setPhotos(photosData || []);

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading...
      </main>
    );
  }

  const groupedSections = [
    {
      title: "Safety Items",
      priority: "Safety",
    },
    {
      title: "Major Items",
      priority: "Major",
    },
    {
      title: "Recommended Repairs",
      priority: "Recommended",
    },
    {
      title: "Informational Items",
      priority: "Informational",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-4xl font-bold text-orange-400">
              Repair Request Builder
            </h1>

            <p className="mt-2 text-slate-400">
              {inspection?.property_address}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white transition hover:bg-orange-500"
            >
              Print / Save PDF
            </button>

            <Link
              href={`/reports/${params.id}`}
              className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
            >
              Back To Report
            </Link>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-lg text-slate-300">
            Total Requested Repair Items:
            <span className="ml-2 font-bold text-white">
              {findings.length}
            </span>
          </p>
        </div>

        {findings.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-slate-400">
              No findings have been added to the repair request yet.
            </p>
          </div>
        )}

        <div className="space-y-10">
          {groupedSections.map((section) => {
            const sectionFindings = findings.filter(
              (finding) =>
                (finding.repair_priority || "Recommended") ===
                section.priority
            );

            return (
              <section key={section.priority}>
                <h2 className="mb-5 text-3xl font-bold text-orange-400">
                  {section.title}
                </h2>

                {sectionFindings.length === 0 ? (
                  <p className="text-slate-500">
                    No items in this section.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {sectionFindings.map((finding) => {
                      const findingPhotos = photos.filter(
                        (photo) => photo.finding_id === finding.id
                      );

                      return (
                        <div
                          key={finding.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                        >
                          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <h3 className="text-2xl font-bold text-white">
                                {finding.title}
                              </h3>

                              <p className="mt-1 text-sm text-slate-500">
                                {finding.section}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-800 px-3 py-1 text-sm text-slate-300">
                              {finding.defect_type || "General"}
                            </div>
                          </div>

                          {finding.observation && (
                            <div className="mb-5">
                              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-400">
                                Observation
                              </p>

                              <p className="leading-7 text-slate-200">
                                {finding.observation}
                              </p>
                            </div>
                          )}

                          {finding.implication && (
                            <div className="mb-5">
                              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-400">
                                Implication
                              </p>

                              <p className="leading-7 text-slate-200">
                                {finding.implication}
                              </p>
                            </div>
                          )}

                          {finding.recommendation && (
                            <div className="mb-5">
                              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-400">
                                Requested Repair
                              </p>

                              <p className="leading-7 text-slate-200">
                                {finding.recommendation}
                              </p>
                            </div>
                          )}

                          {finding.repair_notes && (
                            <div className="mb-5 rounded-xl border border-slate-700 bg-slate-800 p-4">
                              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-400">
                                Repair Request Notes
                              </p>

                              <p className="text-slate-200">
                                {finding.repair_notes}
                              </p>
                            </div>
                          )}

                          {findingPhotos.length > 0 && (
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                              {findingPhotos.map((photo) => (
                                <img
                                  key={photo.id}
                                  src={photo.photo_url}
                                  alt="Finding Photo"
                                  className="h-40 w-full rounded-xl border border-slate-700 object-cover"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
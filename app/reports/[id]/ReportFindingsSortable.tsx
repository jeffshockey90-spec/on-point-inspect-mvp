"use client";

import { useState } from "react";
import EditableFinding from "../../../components/EditableFinding";

export default function ReportFindingsSortable({ groupedFindings }: any) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  function toggleSection(section: string) {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !(prev[section] ?? false),
    }));
  }

  return (
    <div className="space-y-6">
      {(groupedFindings || []).map((group: any) => {
        const isOpen = openSections[group.section] ?? false;

        return (
          <section
            key={group.section}
            className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl"
          >
            <button
              type="button"
              onClick={() => toggleSection(group.section)}
              className="flex w-full items-center justify-between border-b border-slate-700 px-6 py-4 text-left hover:bg-slate-800/60"
            >
              <div>
                <h2 className="text-2xl font-bold text-teal-400">
                  {group.section}
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  {(group.findings || []).length} finding
                  {(group.findings || []).length === 1 ? "" : "s"}
                </p>
              </div>

              <span className="text-2xl font-black text-teal-300">
                {isOpen ? "−" : "+"}
              </span>
            </button>

            {isOpen && (
              <div className="space-y-5 p-5">
                {(group.findings || []).length === 0 && (
                  <div className="rounded-xl border border-slate-700 bg-[#071224] p-5 text-slate-400">
                    No findings in this section.
                  </div>
                )}

                {(group.findings || []).map((finding: any) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function getSeverityStyle(severity: string | null | undefined) {
  const clean = String(severity || "Recommended Repair").toLowerCase();

  if (
    clean.includes("safety") ||
    clean.includes("hazard") ||
    clean.includes("major")
  ) {
    return "border-red-500/60 bg-red-500/10 text-red-300";
  }

  if (
    clean.includes("maintenance") ||
    clean.includes("monitor") ||
    clean.includes("minor")
  ) {
    return "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  if (
    clean.includes("information") ||
    clean.includes("info") ||
    clean.includes("client")
  ) {
    return "border-blue-500/60 bg-blue-500/10 text-blue-300";
  }

  return "border-teal-500/60 bg-teal-500/10 text-teal-300";
}

function FindingCard({ finding }: any) {
  const firstPhoto = finding.photos?.[0];

  const image =
    finding.signed_image_url ||
    finding.image_url ||
    finding.public_image_url ||
    firstPhoto?.signed_url ||
    firstPhoto?.public_url ||
    firstPhoto?.image_url ||
    firstPhoto?.photo_url ||
    "";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl">
      {image && (
        <div className="border-b border-slate-700 bg-black">
          <img
            src={image}
            alt="Finding"
            className="max-h-[650px] w-full object-contain"
          />
        </div>
      )}

      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${getSeverityStyle(
              finding.severity
            )}`}
          >
            {finding.severity || "Recommended Repair"}
          </span>

          {finding.section && (
            <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">
              {finding.section}
            </span>
          )}
        </div>

        <h3 className="mb-4 text-2xl font-black text-white">
          {finding.title ||
            finding.finding_title ||
            finding.defect_title ||
            finding.name ||
            "Untitled Finding"}
        </h3>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch("/api/save-finding-template", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    title:
                      finding.title ||
                      finding.finding_title ||
                      finding.defect_title ||
                      finding.name ||
                      "Untitled Finding",
                    section: finding.section || "Inspection Details",
                    severity: finding.severity || "Recommended Repair",
                    observation: finding.observation || "",
                    implication: finding.implication || "",
                    recommendation: finding.recommendation || "",
                  }),
                });

                let data: any = {};

                try {
                  data = await res.json();
                } catch {
                  data = {};
                }

                if (!res.ok) {
                  alert(data.error || "Failed to save template.");
                  return;
                }

                alert("Template saved!");
              } catch {
                alert("Failed to save template.");
              }
            }}
            className="rounded-xl border border-yellow-500 px-4 py-2 text-sm font-black text-yellow-300 hover:bg-yellow-500/10"
          >
            ⭐ Save as Template
          </button>
        </div>

        <EditableFinding finding={finding} />

        {finding.observation && (
          <ReportBlock title="Observation" text={finding.observation} />
        )}

        {finding.implication && (
          <ReportBlock title="Implication" text={finding.implication} />
        )}

        {finding.recommendation && (
          <ReportBlock title="Recommendation" text={finding.recommendation} />
        )}

        {finding.comment && (
          <ReportBlock title="Additional Notes" text={finding.comment} />
        )}
      </div>
    </article>
  );
}

function ReportBlock({ title, text }: any) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-lg font-bold text-white">{title}</h4>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="whitespace-pre-line text-sm leading-7 text-slate-200">
          {text}
        </p>
      </div>
    </div>
  );
}

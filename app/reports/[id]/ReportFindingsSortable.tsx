"use client";

import { useMemo, useState } from "react";
import EditableFinding from "../../../components/EditableFinding";

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Disclaimers",
  "Garage",
];

export default function ReportFindingsSortable({
  groupedFindings,
  inspectionId,
}: any) {
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    {}
  );

  const orderedGroups = useMemo(() => {
    const groups = groupedFindings || [];

    return SECTION_ORDER.map((section) => {
      const existing = groups.find((group: any) => group.section === section);

      return {
        section,
        findings: existing?.findings || [],
      };
    }).filter((group) => !hiddenSections.includes(group.section));
  }, [groupedFindings, hiddenSections]);

  function toggleSection(section: string) {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  function hideSection(section: string) {
    const confirmed = confirm(
      `Hide "${section}" from this report view? This will not delete your findings.`
    );

    if (!confirmed) return;

    setHiddenSections((prev) =>
      [...prev, section].filter((item, index, array) => array.indexOf(item) === index)
    );
  }

  function restoreAllSections() {
    setHiddenSections([]);
  }

  return (
    <div className="space-y-6">
      {hiddenSections.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-[#071224] p-4">
          <button
            type="button"
            onClick={restoreAllSections}
            className="rounded-xl border border-teal-500 px-4 py-2 text-sm font-bold text-teal-300 hover:bg-teal-500/10"
          >
            Restore Hidden Sections
          </button>
        </div>
      )}

      {orderedGroups.map((group: any) => {
        const collapsed = collapsedSections[group.section] ?? true;

        return (
          <section
            key={group.section}
            className="overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl"
          >
            <div className="border-b border-slate-700 bg-slate-800/80 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection(group.section)}
                  className="flex flex-1 items-center justify-between text-left"
                >
                  <h2 className="text-2xl font-bold text-teal-400">
                    {group.section}
                  </h2>

                  <span className="text-xl font-bold text-slate-300">
                    {collapsed ? "+" : "−"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => hideSection(group.section)}
                  className="rounded-xl border border-red-500/50 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"
                >
                  Hide Section
                </button>
              </div>
            </div>

            {!collapsed && (
              <div className="space-y-5 p-5">
                {group.findings?.length > 0 ? (
                  group.findings.map((finding: any) => (
                    <NormalFindingCard key={finding.id} finding={finding} />
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-slate-400">
                    No findings in this section.
                  </div>
                )}
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

function NormalFindingCard({ finding }: any) {
  const firstPhoto = finding.photos?.[0];

  const image =
    finding.signed_image_url ||
    finding.image_url ||
    finding.public_image_url ||
    firstPhoto?.signed_url ||
    firstPhoto?.public_url ||
    firstPhoto?.image_url ||
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
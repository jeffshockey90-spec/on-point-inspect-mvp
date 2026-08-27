"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { useSeverityConfig } from "../../../../lib/severity/useSeverityConfig";
import { severityBadgeStyle } from "../../../../lib/severity/severityConfig";

const SEVERITY_ORDER = [
  "Major Concern",
  "Safety Concern",
  "Recommended Repair",
  "Maintenance",
  "Monitor",
  "Informational",
];

type Finding = {
  id: string | number;
  title?: string | null;
  section?: string | null;
  severity?: string | null;
  observation?: string | null;
  implication?: string | null;
  recommendation?: string | null;
  comment?: string | null;
  image_url?: string | null;
  photos?: any[];
};

function cleanText(value: any) {
  return String(value || "").trim();
}

function getSeverityBucket(severityValue: any) {
  const severity = String(severityValue || "Recommended Repair").toLowerCase();

  if (severity.includes("major")) return "major";
  if (severity.includes("safety") || severity.includes("hazard")) return "safety";
  if (severity.includes("repair") || severity.includes("defect")) return "repair";
  if (severity.includes("maintenance")) return "maintenance";
  if (severity.includes("monitor")) return "monitor";
  if (severity.includes("information") || severity.includes("info")) return "information";

  return "repair";
}

function isReportDefect(finding: Finding) {
  const section = cleanText(finding.section).toLowerCase();
  const title = cleanText(finding.title).toLowerCase();

  const nonDefectTitles = new Set([
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ]);

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;
  if (nonDefectTitles.has(title)) return false;
  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function getSeverityClass(severityValue: any) {
  const bucket = getSeverityBucket(severityValue);

  if (bucket === "major" || bucket === "safety") {
    return "border-red-500/50 bg-red-500/15 text-red-200";
  }

  if (bucket === "maintenance" || bucket === "monitor") {
    return "border-yellow-500/50 bg-yellow-500/15 text-yellow-200";
  }

  if (bucket === "information") {
    return "border-blue-500/50 bg-blue-500/15 text-blue-200";
  }

  return "border-teal-500/50 bg-teal-500/15 text-[var(--fl-accent-text)]";
}

function getMediaUrl(media: any) {
  return media?.signed_url || media?.public_url || media?.image_url || media?.photo_url || media?.url || "";
}

function getPhotoUrl(finding: Finding) {
  const photos = Array.isArray(finding.photos) ? finding.photos : [];
  const firstPhoto = photos.find((photo) => Boolean(getMediaUrl(photo)));
  return getMediaUrl(firstPhoto) || finding.image_url || "";
}

function getFindingSummary(finding: Finding) {
  return (
    finding.observation ||
    finding.recommendation ||
    finding.implication ||
    finding.comment ||
    "Tap to view finding details."
  );
}

function groupFindings(findings: Finding[]) {
  const groups = [
    {
      key: "major",
      title: "Major Concerns",
      description: "Significant concerns, major system issues, or potentially costly repairs.",
      findings: findings.filter((finding) => isReportDefect(finding) && getSeverityBucket(finding.severity) === "major"),
    },
    {
      key: "safety",
      title: "Safety Concerns",
      description: "Items that may involve injury, fall, shock, fire, burn, or other safety risks.",
      findings: findings.filter((finding) => isReportDefect(finding) && getSeverityBucket(finding.severity) === "safety"),
    },
    {
      key: "repair",
      title: "Recommended Repairs",
      description: "Defects or damaged components where repair, correction, or specialist evaluation is recommended.",
      findings: findings.filter((finding) => isReportDefect(finding) && getSeverityBucket(finding.severity) === "repair"),
    },
    {
      key: "maintenance",
      title: "Maintenance Items",
      description: "Routine maintenance and minor upkeep items.",
      findings: findings.filter((finding) => isReportDefect(finding) && getSeverityBucket(finding.severity) === "maintenance"),
    },
    {
      key: "monitor",
      title: "Monitor Items",
      description: "Conditions that should be watched over time.",
      findings: findings.filter((finding) => isReportDefect(finding) && getSeverityBucket(finding.severity) === "monitor"),
    },
    {
      key: "information",
      title: "Informational Items",
      description: "Client awareness items documented for reference.",
      findings: findings.filter((finding) => isReportDefect(finding) && getSeverityBucket(finding.severity) === "information"),
    },
  ];

  return groups.filter((group) => group.findings.length > 0);
}

export default function ReportSummaryPage() {
  const params = useParams();
  const reportId = String(params.id || "");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(true);

  const groupedFindings = useMemo(() => groupFindings(findings), [findings]);
  const defectCount = useMemo(() => findings.filter(isReportDefect).length, [findings]);

  useEffect(() => {
    if (!reportId) return;

    async function loadFindings() {
      setFindingsLoading(true);

      try {
        const { data: findingsData, error: findingsError } = await supabase
          .from("findings")
          .select("*")
          .eq("inspection_id", reportId)
          .order("created_at", { ascending: true });

        if (findingsError) throw findingsError;

        const findingIds = (findingsData || []).map((finding: any) => finding.id);

        const { data: photosData } =
          findingIds.length > 0
            ? await supabase.from("photos").select("*").in("finding_id", findingIds)
            : { data: [] as any[] };

        const photosByFindingId = (photosData || []).reduce(
          (acc: Record<string, any[]>, photo: any) => {
            if (!photo.finding_id) return acc;
            if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
            acc[photo.finding_id].push(photo);
            return acc;
          },
          {}
        );

        setFindings(
          (findingsData || [])
            .map((finding: any) => ({
              ...finding,
              photos: photosByFindingId[finding.id] || [],
            }))
            .sort((a: Finding, b: Finding) => {
              const aIndex = SEVERITY_ORDER.indexOf(cleanText(a.severity));
              const bIndex = SEVERITY_ORDER.indexOf(cleanText(b.severity));
              return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
            })
        );
      } catch (error: any) {
        setMessage(error?.message || "Could not load summary cards.");
      } finally {
        setFindingsLoading(false);
      }
    }

    loadFindings();
  }, [reportId]);

  async function generateSummary() {
    if (!reportId) {
      alert("Missing report ID.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/report-summary?id=${reportId}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        setSummary(data.error || "Failed to generate summary.");
        return;
      }

      setSummary(data.summary || "No summary generated.");
    } catch (error: any) {
      setSummary(error?.message || "Failed to generate summary.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSummaryToReport() {
    if (!summary.trim()) {
      alert("No summary to save.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/report-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: reportId,
          summary,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Could not save summary.");
        return;
      }

      setMessage("Report Summary saved to the report.");
    } catch (error: any) {
      alert(error?.message || "Could not save summary.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-extrabold text-[var(--fl-accent-text)]">
              Realtor Summary
            </h1>
            <p className="mt-2 text-sm text-[var(--fl-muted)]">
              Generate an editable AI summary and review a client-facing card summary of notable findings.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateSummary}
              disabled={loading || saving}
              className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10 disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate Summary"}
            </button>

            <button
              type="button"
              onClick={saveSummaryToReport}
              disabled={loading || saving || !summary.trim()}
              className="rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Summary to Report"}
            </button>

            <Link
              href={`/reports/${reportId}`}
              className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
            >
              Back to Report
            </Link>
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-5 py-4 font-bold text-[var(--fl-accent-text)]">
            {message}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--fl-line)] bg-[#071224] p-8 shadow-xl">
          {!summary && !loading && (
            <p className="mb-5 text-[var(--fl-muted)]">
              Click Generate Summary to create a defect-focused client/realtor summary.
            </p>
          )}

          {loading ? (
            <p className="text-lg text-[var(--fl-muted)]">
              Generating defect-focused report summary...
            </p>
          ) : (
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={18}
              placeholder="Generated summary will appear here..."
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-5 text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
          )}
        </div>

        <section className="mt-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
                Client Summary Cards
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                Key Findings Summary
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                This is a Spectora-style summary view grouped by severity. It does not replace the full report; it helps clients and agents quickly review the important findings.
              </p>
            </div>

            <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-6 py-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                Total Summary Items
              </p>
              <p className="mt-1 text-4xl font-semibold text-[var(--fl-text)]">
                {defectCount}
              </p>
            </div>
          </div>

          {findingsLoading ? (
            <div className="mt-6 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-6 text-[var(--fl-muted)]">
              Loading finding cards...
            </div>
          ) : groupedFindings.length === 0 ? (
            <div className="mt-6 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-6 text-[var(--fl-muted)]">
              No report findings are available for the card summary yet.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {groupedFindings.map((group) => (
                <div key={group.key} className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-[var(--fl-text)]">{group.title}</h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                        {group.description}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)]">
                      {group.findings.length} item{group.findings.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.findings.map((finding) => (
                      <SummaryFindingCard key={finding.id} finding={finding} reportId={reportId} />
                    ))}
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

function SummaryFindingCard({ finding, reportId }: { finding: Finding; reportId: string }) {
  const severityConfig = useSeverityConfig();
  const photoUrl = getPhotoUrl(finding);
  const title = cleanText(finding.title) || "Untitled Finding";
  const summary = getFindingSummary(finding);

  return (
    <Link
      href={`/reports/${reportId}#section-${cleanText(finding.section)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`}
      className="group overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] transition hover:-translate-y-0.5 hover:border-teal-400"
    >
      <div className="h-44 overflow-hidden border-b border-[var(--fl-raised)] bg-black">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
            No Photo
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={severityBadgeStyle(severityConfig, finding.severity)}
          >
            {finding.severity || "Recommended Repair"}
          </span>
          <span className="rounded-full border border-[var(--fl-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            {finding.section || "Report"}
          </span>
        </div>

        <h4 className="line-clamp-2 text-lg font-semibold leading-tight text-[var(--fl-text)]">
          {title}
        </h4>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--fl-muted)]">
          {summary}
        </p>

        <p className="mt-4 text-sm font-semibold text-cyan-300">
          Open Finding →
        </p>
      </div>
    </Link>
  );
}

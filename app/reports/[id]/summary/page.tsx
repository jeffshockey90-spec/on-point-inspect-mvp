import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import PrintSummaryButton from "../../../../components/PrintSummaryButton";

const SEVERITY_ORDER = [
  "Safety Concern",
  "Major Concern",
  "Recommended Repair",
  "Maintenance",
  "Monitor",
  "Informational",
];

export default async function RealtorSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const inspectionId = resolvedParams.id;

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();

  const { data: findings, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId);

  if (inspectionError) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading inspection: {inspectionError.message}
      </main>
    );
  }

  if (findingsError) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading findings: {findingsError.message}
      </main>
    );
  }

  const allFindings = findings || [];

  const grouped = SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: allFindings.filter(
      (finding: any) => finding.severity === severity
    ),
  })).filter((group) => group.findings.length > 0);

  const safetyCount = allFindings.filter(
    (finding: any) => finding.severity === "Safety Concern"
  ).length;

  const majorCount = allFindings.filter(
    (finding: any) => finding.severity === "Major Concern"
  ).length;

  const repairCount = allFindings.filter(
    (finding: any) => finding.severity === "Recommended Repair"
  ).length;

  const maintenanceCount = allFindings.filter(
    (finding: any) =>
      finding.severity === "Maintenance" ||
      finding.severity === "Monitor"
  ).length;

  return (
    <main className="min-h-screen bg-[#0f172a] p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl rounded-2xl bg-[#111827] p-5 shadow-2xl md:p-10">
        <div className="mb-8 flex flex-wrap gap-3 print:hidden">
          <Link
            href={`/reports/${inspectionId}`}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            Back to Full Report
          </Link>

          <PrintSummaryButton />
        </div>

        <header className="border-b border-slate-700 pb-6">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-teal-400">
            Realtor Summary
          </p>

          <h1 className="mt-3 text-4xl font-extrabold text-white">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-lg text-slate-300">
            Summary of notable inspection findings.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Property Summary
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Property" value={inspection.property_address} />

            <Info
              label="Location"
              value={`${inspection.city || ""}, ${
                inspection.state || ""
              } ${inspection.zip || ""}`}
            />

            <Info label="Client" value={inspection.client_name} />

            <Info label="Realtor" value={inspection.realtor_name} />

            <Info
              label="Inspection Date"
              value={inspection.inspection_date}
            />

            <Info
              label="Inspection Time"
              value={inspection.inspection_time}
            />
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Safety" value={safetyCount} />

          <SummaryCard label="Major" value={majorCount} />

          <SummaryCard label="Repair" value={repairCount} />

          <SummaryCard
            label="Maintenance / Monitor"
            value={maintenanceCount}
          />
        </section>

        <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6">
          <h2 className="mb-4 text-2xl font-bold text-teal-400">
            Important Note
          </h2>

          <p className="leading-7 text-slate-300">
            This summary is provided as a quick-reference overview only.
            It does not replace the full inspection report. The full
            report should be reviewed in its entirety for complete
            observations, implications, recommendations, photos,
            limitations, and context.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="mb-6 text-3xl font-bold text-teal-400">
            Findings Summary
          </h2>

          {allFindings.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-8 text-center text-slate-300">
              No findings saved yet.
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map((group) => (
                <div
                  key={group.severity}
                  className="rounded-2xl border border-slate-700 bg-[#0f172a] p-6"
                >
                  <h3 className="mb-5 border-b border-slate-700 pb-3 text-2xl font-bold text-white">
                    {group.severity}
                  </h3>

                  <div className="space-y-5">
                    {group.findings.map((finding: any) => (
                      <div
                        key={finding.id}
                        className="rounded-xl border border-slate-700 bg-[#111827] p-5"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-300">
                            {finding.section || "General"}
                          </span>

                          <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">
                            {finding.severity}
                          </span>
                        </div>

                        <h4 className="text-xl font-bold text-teal-300">
                          {finding.title}
                        </h4>

                        {finding.observation && (
                          <p className="mt-3 leading-7 text-slate-300">
                            <span className="font-bold text-white">
                              Observation:
                            </span>{" "}
                            {finding.observation}
                          </p>
                        )}

                        {finding.recommendation && (
                          <p className="mt-3 leading-7 text-slate-300">
                            <span className="font-bold text-white">
                              Recommendation:
                            </span>{" "}
                            {finding.recommendation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-slate-700 pt-6 text-sm text-slate-400">
          <p>
            On Point Home Inspections LLC • Realtor Summary • Full
            report should be reviewed in its entirety.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-base text-white">
        {value || "N/A"}
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5 text-center">
      <p className="text-4xl font-extrabold text-teal-400">
        {value}
      </p>

      <p className="mt-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}
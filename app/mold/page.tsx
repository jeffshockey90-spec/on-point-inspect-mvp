"use client";


import { formatAppValue } from "../../lib/app-time";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function classifyMold(status: any) {
  const value = String(status || "").toLowerCase();

  if (
    value.includes("elevated") ||
    value.includes("positive") ||
    value.includes("action") ||
    value.includes("recommend")
  ) {
    return "Action Recommended";
  }

  if (
    value.includes("normal") ||
    value.includes("not elevated") ||
    value.includes("acceptable") ||
    value.includes("clear")
  ) {
    return "Normal";
  }

  return "Pending";
}

function getResultStyle(result: string) {
  if (result === "Action Recommended") {
    return "border-red-500/40 bg-red-500/10 text-red-300";
  }

  if (result === "Normal") {
    return "border-green-500/40 bg-green-500/10 text-green-300";
  }

  return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
}

function buildSummary({
  airSamples,
  surfaceSamples,
  result,
  findings,
  labStatus,
}: {
  airSamples: number;
  surfaceSamples: number;
  result: string;
  findings: string;
  labStatus: string;
}) {
  const parts = [];

  if (airSamples > 0) {
    parts.push(`${airSamples} air sample${airSamples === 1 ? "" : "s"}`);
  }

  if (surfaceSamples > 0) {
    parts.push(
      `${surfaceSamples} surface/tape/swab sample${
        surfaceSamples === 1 ? "" : "s"
      }`
    );
  }

  const sampleText =
    parts.length > 0 ? parts.join(" and ") : "mold samples";

  if (labStatus !== "Completed" && result === "Pending") {
    return `Mold sampling was performed with ${sampleText}. The current lab status is ${labStatus}. Final laboratory results are pending.`;
  }

  if (result === "Action Recommended") {
    return `Mold sampling was performed with ${sampleText}. The lab results or observations indicate elevated or concerning conditions. Further evaluation and/or remediation by a qualified mold remediation contractor is recommended.${
      findings ? ` Summary: ${findings}` : ""
    }`;
  }

  if (result === "Normal") {
    return `Mold sampling was performed with ${sampleText}. The lab results did not indicate elevated mold conditions at the sampled locations at the time of testing.${
      findings ? ` Summary: ${findings}` : ""
    }`;
  }

  return `Mold sampling was performed with ${sampleText}. Lab results are pending or have not been fully entered yet.${
    findings ? ` Notes: ${findings}` : ""
  }`;
}

export default function MoldPage() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [forms, setForms] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    loadMoldTests();
  }, []);

  async function loadMoldTests() {
    try {
      setLoading(true);

      const res = await fetch("/api/mold-tests", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load mold tests.");
        return;
      }

      const rows = data.inspections || [];
      setInspections(rows);

      const initialForms: Record<string, any> = {};

      rows.forEach((inspection: any) => {
        const test = inspection.mold_test || {};

        initialForms[String(inspection.id)] = {
          air_samples: test.air_samples ?? inspection.mold_air_samples ?? 0,
          surface_samples:
            test.surface_samples ?? inspection.mold_surface_samples ?? 0,
          lab_name: test.lab_name || "",
          lab_report_url: test.lab_report_url || "",
          lab_status: test.lab_status || "Pending Collection",
          result: test.result || "Pending",
          findings: test.findings || "",
          notes: test.notes || "",
        };
      });

      setForms(initialForms);
    } catch (error: any) {
      alert(error?.message || "Failed to load mold tests.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(inspectionId: any, field: string, value: string) {
    const key = String(inspectionId);

    setForms((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [field]: value,
      },
    }));
  }

  async function saveMoldTest(inspectionId: any) {
    try {
      const key = String(inspectionId);
      setSavingId(key);

      const form = forms[key] || {};

      const res = await fetch("/api/mold-tests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspection_id: inspectionId,
          ...form,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to save mold test.");
        return;
      }

      await loadMoldTests();

      alert("Mold test saved.");
    } catch (error: any) {
      alert(error?.message || "Failed to save mold test.");
    } finally {
      setSavingId(null);
    }
  }

  async function copySummary(inspectionId: any) {
    const key = String(inspectionId);
    const form = forms[key] || {};
    const result = classifyMold(form.result);

    const summary = buildSummary({
      airSamples: getNumber(form.air_samples),
      surfaceSamples: getNumber(form.surface_samples),
      result,
      findings: form.findings || "",
      labStatus: form.lab_status || "Pending Collection",
    });

    await navigator.clipboard.writeText(summary);
    alert("Client summary copied.");
  }

  const stats = useMemo(() => {
    const total = inspections.length;

    const completed = inspections.filter((inspection) => {
      const test = inspection.mold_test;
      return test && test.result && test.result !== "Pending";
    }).length;

    const pendingResults = inspections.filter((inspection) => {
      const test = inspection.mold_test;
      return !test || !test.result || test.result === "Pending";
    }).length;

    const actionRecommended = inspections.filter((inspection) => {
      const result = inspection.mold_test?.result;
      return classifyMold(result) === "Action Recommended";
    }).length;

    const airSamples = inspections.reduce((sum, inspection) => {
      return (
        sum +
        (getNumber(inspection.mold_test?.air_samples) ||
          getNumber(inspection.mold_air_samples))
      );
    }, 0);

    const surfaceSamples = inspections.reduce((sum, inspection) => {
      return (
        sum +
        (getNumber(inspection.mold_test?.surface_samples) ||
          getNumber(inspection.mold_surface_samples))
      );
    }, 0);

    const totalSamples = airSamples + surfaceSamples;

    const revenue = inspections.reduce((sum, inspection) => {
      return sum + getNumber(inspection.mold_fee || 0);
    }, 0);

    const averageJob = total > 0 ? revenue / total : 0;

    return {
      total,
      completed,
      pendingResults,
      actionRecommended,
      airSamples,
      surfaceSamples,
      totalSamples,
      revenue,
      averageJob,
    };
  }, [inspections]);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                On Point Inspect
              </p>

              <h1 className="mt-4 text-5xl font-black text-white">
                Mold Testing
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Track mold samples, lab status, lab reports, results, findings,
                revenue, and client-friendly summaries.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Mold Jobs"
            value={String(stats.total)}
            helper="Inspections with mold service."
            tone="teal"
          />

          <MetricCard
            label="Completed"
            value={String(stats.completed)}
            helper="Lab result entered."
            tone="green"
          />

          <MetricCard
            label="Results Pending"
            value={String(stats.pendingResults)}
            helper="Awaiting final lab result."
            tone="yellow"
          />

          <MetricCard
            label="Elevated Results"
            value={String(stats.actionRecommended)}
            helper="Action recommended."
            tone="red"
          />

          <MetricCard
            label="Air Samples"
            value={String(stats.airSamples)}
            helper={`${stats.surfaceSamples} surface/tape/swab samples.`}
            tone="purple"
          />

          <MetricCard
            label="Total Samples"
            value={String(stats.totalSamples)}
            helper="Air + surface samples."
            tone="purple"
          />

          <MetricCard
            label="Mold Revenue"
            value={money(stats.revenue)}
            helper="Based on saved mold fee."
            tone="blue"
          />

          <MetricCard
            label="Average Mold Job"
            value={money(stats.averageJob)}
            helper="Mold revenue divided by jobs."
            tone="blue"
          />
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">
            Mold Revenue Breakdown
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <BreakdownCard label="Mold Jobs" value={String(stats.total)} />
            <BreakdownCard label="Air Samples" value={String(stats.airSamples)} />
            <BreakdownCard
              label="Surface Samples"
              value={String(stats.surfaceSamples)}
            />
            <BreakdownCard label="Revenue" value={money(stats.revenue)} />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">
            Mold Test List
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Track sample counts, lab status, findings, lab report links, and
            client-ready summaries.
          </p>

          {loading ? (
            <div className="mt-6 rounded-xl border border-slate-700 bg-[#020817]/70 p-8 text-center text-slate-400">
              Loading mold tests...
            </div>
          ) : inspections.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-700 bg-[#020817]/70 p-8 text-center text-slate-400">
              No mold jobs found yet. Create an inspection with Mold Only,
              Radon + Mold, Home + Mold, or Home + Radon + Mold to see it here.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {inspections.map((inspection: any) => {
                const key = String(inspection.id);
                const form = forms[key] || {};
                const result = classifyMold(form.result);
                const summary = buildSummary({
                  airSamples: getNumber(form.air_samples),
                  surfaceSamples: getNumber(form.surface_samples),
                  result,
                  findings: form.findings || "",
                  labStatus: form.lab_status || "Pending Collection",
                });

                return (
                  <div
                    key={inspection.id}
                    className="rounded-2xl border border-slate-800 bg-[#020817]/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-black text-white">
                          {inspection.property_address ||
                            inspection.address ||
                            "Untitled Inspection"}
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          {inspection.client_name || "No client"} •{" "}
                          {formatDate(inspection.inspection_date)} • ID #
                          {inspection.id}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {inspection.inspection_type ||
                            inspection.services ||
                            "Mold Service"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-4 py-2 text-xs font-black ${getResultStyle(
                          result
                        )}`}
                      >
                        {result}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                      <Field
                        label="Air Samples"
                        value={String(form.air_samples ?? "")}
                        onChange={(value) =>
                          updateForm(inspection.id, "air_samples", value)
                        }
                      />

                      <Field
                        label="Surface/Tape/Swab Samples"
                        value={String(form.surface_samples ?? "")}
                        onChange={(value) =>
                          updateForm(inspection.id, "surface_samples", value)
                        }
                      />

                      <Field
                        label="Lab Name"
                        value={form.lab_name}
                        onChange={(value) =>
                          updateForm(inspection.id, "lab_name", value)
                        }
                        type="text"
                      />

                      <label>
                        <span className="text-sm font-bold text-slate-300">
                          Lab Status
                        </span>
                        <select
                          value={form.lab_status || "Pending Collection"}
                          onChange={(event) =>
                            updateForm(
                              inspection.id,
                              "lab_status",
                              event.target.value
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white"
                        >
                          <option value="Pending Collection">
                            Pending Collection
                          </option>
                          <option value="Collected">Collected</option>
                          <option value="Sent To Lab">Sent To Lab</option>
                          <option value="Lab Results Received">
                            Lab Results Received
                          </option>
                          <option value="Completed">Completed</option>
                        </select>
                      </label>

                      <label>
                        <span className="text-sm font-bold text-slate-300">
                          Result
                        </span>
                        <select
                          value={form.result || "Pending"}
                          onChange={(event) =>
                            updateForm(inspection.id, "result", event.target.value)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Normal">Normal / Not Elevated</option>
                          <option value="Action Recommended">
                            Elevated / Action Recommended
                          </option>
                        </select>
                      </label>

                      <Field
                        label="Lab Report URL"
                        value={form.lab_report_url}
                        onChange={(value) =>
                          updateForm(inspection.id, "lab_report_url", value)
                        }
                        type="text"
                      />
                    </div>

                    <label className="mt-4 block">
                      <span className="text-sm font-bold text-slate-300">
                        Findings / Lab Summary
                      </span>
                      <textarea
                        value={form.findings || ""}
                        onChange={(event) =>
                          updateForm(
                            inspection.id,
                            "findings",
                            event.target.value
                          )
                        }
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white"
                        placeholder="Brief summary of lab findings, sample locations, or elevated mold types..."
                      />
                    </label>

                    <label className="mt-4 block">
                      <span className="text-sm font-bold text-slate-300">
                        Notes
                      </span>
                      <textarea
                        value={form.notes || ""}
                        onChange={(event) =>
                          updateForm(inspection.id, "notes", event.target.value)
                        }
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white"
                        placeholder="Sampling limitations, rooms sampled, humidity/moisture observations, or client notes..."
                      />
                    </label>

                    <div className="mt-4 rounded-xl border border-slate-700 bg-[#0f172a] p-4">
                      <p className="text-sm font-black uppercase tracking-wide text-slate-400">
                        Client Summary
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-200">
                        {summary}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => saveMoldTest(inspection.id)}
                        disabled={savingId === key}
                        className="rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === key ? "Saving..." : "Save Mold Test"}
                      </button>

                      <button
                        type="button"
                        onClick={() => copySummary(inspection.id)}
                        className="rounded-xl border border-yellow-500 px-5 py-3 font-bold text-yellow-300 hover:bg-yellow-500/10"
                      >
                        Copy Client Summary
                      </button>

                      <Link
                        href={`/reports/${inspection.id}`}
                        className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
                      >
                        View Report
                      </Link>

                      <Link
                        href={`/invoices/${inspection.id}/print`}
                        className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
                      >
                        Invoice PDF
                      </Link>

                      {form.lab_report_url && (
                        <a
                          href={form.lab_report_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10"
                        >
                          Open Lab Report
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "green" | "teal" | "blue" | "red" | "purple" | "yellow";
}) {
  const colors: Record<string, string> = {
    green: "border-green-500/40 bg-green-950/20 text-green-300",
    teal: "border-teal-500/40 bg-teal-950/20 text-teal-300",
    blue: "border-blue-500/40 bg-blue-950/20 text-blue-300",
    red: "border-red-500/40 bg-red-950/20 text-red-300",
    purple: "border-purple-500/40 bg-purple-950/20 text-purple-300",
    yellow: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${colors[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{helper}</p>
    </div>
  );
}

function BreakdownCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "number",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "number" | "text";
}) {
  return (
    <label>
      <span className="text-sm font-bold text-slate-300">{label}</span>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white"
      />
    </label>
  );
}

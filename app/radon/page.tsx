"use client";


import { formatAppValue } from "../../lib/app-time";
import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabaseClient";

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

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// Convert a stored UTC/ISO timestamp into the local "YYYY-MM-DDTHH:MM" string a
// <input type="datetime-local"> expects, built from local getters so the
// inspector sees the wall-clock time they entered rather than a UTC-shifted one.
function toLocalDateTimeInput(value: any) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Convert a local "YYYY-MM-DDTHH:MM" datetime-local value into a real ISO
// instant before saving, so a timestamptz column records the correct moment
// instead of interpreting the offset-less local string as UTC. Empty stays "".
function toIsoInstant(value: any) {
  if (!value || typeof value !== "string") return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function classifyRadon(value: any) {
  const average = getNumber(value);

  if (!average) return "Pending";
  if (average >= 4) return "Action Recommended";
  if (average >= 2) return "Monitor";

  return "Low";
}

function getResultStyle(result: string) {
  if (result === "Action Recommended") {
    return "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]";
  }

  if (result === "Monitor") {
    return "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  }

  if (result === "Low") {
    return "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]";
  }

  return "border-[var(--fl-faint)] bg-slate-500/10 text-[var(--fl-muted)]";
}

function buildSummary(average: any) {
  const value = getNumber(average);

  if (!value) {
    return "Enter the average radon result to generate a client-friendly summary.";
  }

  if (value >= 4) {
    return `Average radon concentration measured during the testing period was ${value} pCi/L. This is at or above the EPA action level of 4.0 pCi/L. Mitigation by a qualified radon contractor is recommended.`;
  }

  if (value >= 2) {
    return `Average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L but above 2.0 pCi/L. Continued monitoring or consultation may be considered.`;
  }

  return `Average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L.`;
}

export default function RadonPage() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [forms, setForms] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    loadRadonTests();
  }, []);

  async function loadRadonTests() {
    try {
      setLoading(true);

      const res = await fetch("/api/radon-tests", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load radon tests.");
        return;
      }

      const rows = data.inspections || [];
      setInspections(rows);

      const initialForms: Record<string, any> = {};

      rows.forEach((inspection: any) => {
        const test = inspection.radon_test || {};

        initialForms[String(inspection.id)] = {
          average_pci: test.average_pci ?? "",
          highest_pci: test.highest_pci ?? "",
          lowest_pci: test.lowest_pci ?? "",
          start_time: toLocalDateTimeInput(test.start_time),
          end_time: toLocalDateTimeInput(test.end_time),
          device_name: test.device_name || "",
          serial_number: test.serial_number || "",
          report_url: test.report_url || "",
          report_status: test.report_status || "Pending",
          notes: test.notes || "",
        };
      });

      setForms(initialForms);
    } catch (error: any) {
      alert(error?.message || "Failed to load radon tests.");
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

  async function saveRadonTest(inspectionId: any) {
    try {
      const key = String(inspectionId);
      setSavingId(key);

      const form = forms[key] || {};

      const res = await fetch("/api/radon-tests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspection_id: inspectionId,
          ...form,
          // Store real instants so timestamptz round-trips correctly; the
          // datetime-local inputs hold offset-less local strings.
          start_time: toIsoInstant(form.start_time),
          end_time: toIsoInstant(form.end_time),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to save radon test.");
        return;
      }

      await loadRadonTests();

      alert("Radon test saved.");
    } catch (error: any) {
      alert(error?.message || "Failed to save radon test.");
    } finally {
      setSavingId(null);
    }
  }

  const stats = useMemo(() => {
    const total = inspections.length;
    const completed = inspections.filter((inspection) => {
      const test = inspection.radon_test;
      return test && test.average_pci !== null && test.average_pci !== undefined;
    }).length;

    const actionRecommended = inspections.filter((inspection) => {
      const average = inspection.radon_test?.average_pci;
      return getNumber(average) >= 4;
    }).length;

    const revenue = inspections.reduce((sum, inspection) => {
      return sum + getNumber(inspection.radon_fee || 0);
    }, 0);

    return {
      total,
      completed,
      actionRecommended,
      revenue,
    };
  }, [inspections]);

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#14c8d2]">
                FLOW
              </p>

              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">
                Radon Testing
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Manage radon tests, readings, device details, and client-friendly
                summaries for inspections with radon services.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Radon Jobs"
            value={String(stats.total)}
            helper="Inspections with radon service."
            tone="teal"
          />

          <MetricCard
            label="Completed"
            value={String(stats.completed)}
            helper="Average pCi/L entered."
            tone="green"
          />

          <MetricCard
            label="Action Level"
            value={String(stats.actionRecommended)}
            helper="Average result at or above 4.0 pCi/L."
            tone="red"
          />

          <MetricCard
            label="Radon Revenue"
            value={money(stats.revenue)}
            helper="Based on saved radon fee."
            tone="blue"
          />
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
            Radon Test List
          </h2>

          <p className="mt-2 text-sm text-[var(--fl-muted)]">
            Results are classified automatically: under 2.0 is Low, 2.0–3.9 is
            Monitor, and 4.0+ is Action Recommended.
          </p>

          {loading ? (
            <div className="mt-6 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center text-[var(--fl-muted)]">
              Loading radon tests...
            </div>
          ) : inspections.length === 0 ? (
            <div className="mt-6 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center text-[var(--fl-muted)]">
              No radon jobs found yet. Create an inspection with Radon Only,
              Home + Radon, or Home + Radon + Mold to see it here.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {inspections.map((inspection: any) => {
                const key = String(inspection.id);
                const form = forms[key] || {};
                const result =
                  inspection.radon_test?.result ||
                  classifyRadon(form.average_pci);
                const summary = buildSummary(form.average_pci);

                return (
                  <div
                    key={inspection.id}
                    className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-semibold text-[var(--fl-text)]">
                          {inspection.property_address ||
                            inspection.address ||
                            "Untitled Inspection"}
                        </p>

                        <p className="mt-1 text-sm text-[var(--fl-muted)]">
                          {inspection.client_name || "No client"} •{" "}
                          {formatDate(inspection.inspection_date)} • ID #
                          {inspection.id}
                        </p>

                        <p className="mt-1 text-sm text-[var(--fl-faint)]">
                          {inspection.inspection_type ||
                            inspection.services ||
                            "Radon Service"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-4 py-2 text-xs font-semibold ${getResultStyle(
                          result
                        )}`}
                      >
                        {result}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                      <Field
                        label="Average pCi/L"
                        value={form.average_pci}
                        onChange={(value) =>
                          updateForm(inspection.id, "average_pci", value)
                        }
                      />

                      <Field
                        label="Highest pCi/L"
                        value={form.highest_pci}
                        onChange={(value) =>
                          updateForm(inspection.id, "highest_pci", value)
                        }
                      />

                      <Field
                        label="Lowest pCi/L"
                        value={form.lowest_pci}
                        onChange={(value) =>
                          updateForm(inspection.id, "lowest_pci", value)
                        }
                      />

                      <DateTimeField
                        label="Start Time"
                        value={form.start_time}
                        onChange={(value) =>
                          updateForm(inspection.id, "start_time", value)
                        }
                      />

                      <DateTimeField
                        label="End Time"
                        value={form.end_time}
                        onChange={(value) =>
                          updateForm(inspection.id, "end_time", value)
                        }
                      />

                      <Field
                        label="Device Name"
                        value={form.device_name}
                        onChange={(value) =>
                          updateForm(inspection.id, "device_name", value)
                        }
                        type="text"
                      />

                      <Field
                        label="Serial Number"
                        value={form.serial_number}
                        onChange={(value) =>
                          updateForm(inspection.id, "serial_number", value)
                        }
                        type="text"
                      />

                      <LabReportField
                        inspectionId={inspection.id}
                        value={form.report_url}
                        onChange={(value) =>
                          updateForm(inspection.id, "report_url", value)
                        }
                      />

                      <label>
                        <span className="text-sm font-bold text-[var(--fl-muted)]">
                          Report Status
                        </span>

                        <select
                          value={form.report_status || "Pending"}
                          onChange={(event) =>
                            updateForm(
                              inspection.id,
                              "report_status",
                              event.target.value
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)]"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Completed">Completed</option>
                          <option value="Action Recommended">
                            Action Recommended
                          </option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-sm font-bold text-[var(--fl-muted)]">
                        Notes
                      </span>
                      <textarea
                        value={form.notes || ""}
                        onChange={(event) =>
                          updateForm(inspection.id, "notes", event.target.value)
                        }
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)]"
                        placeholder="Closed-house conditions, device placement, limitations, or other radon notes..."
                      />
                    </label>

                    <div className="mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                        Client Summary
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--fl-text)]">
                        {summary}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => saveRadonTest(inspection.id)}
                        disabled={savingId === key}
                        className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === key ? "Saving..." : "Save Radon Test"}
                      </button>

                      <Link
                        href={`/reports/${inspection.id}`}
                        className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
                      >
                        View Report
                      </Link>

                      <Link
                        href={`/invoices/${inspection.id}/print`}
                        className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-[var(--fl-info-text)] hover:bg-cyan-500/10"
                      >
                        Invoice PDF
                      </Link>

                      {form.report_url && (
                        <a
                          href={form.report_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-[var(--fl-purple-text)] hover:bg-purple-500/10"
                        >
                          Open Official Report
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
  tone: "green" | "teal" | "blue" | "red";
}) {
  const colors: Record<string, string> = {
    green: "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]",
    teal: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]",
    blue: "border-blue-500/40 bg-blue-500/10 text-[var(--fl-info-text)]",
    red: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${colors[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">{helper}</p>
    </div>
  );
}

// Report field that accepts EITHER a pasted link OR a PDF upload. Radon
// monitors/labs usually produce a PDF, not a URL, so this uploads the file to
// the same public storage bucket used for photos and fills in the link.
function LabReportField({
  inspectionId,
  value,
  onChange,
}: {
  inspectionId: any;
  value: string;
  onChange: (value: string) => void;
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
      const res = await fetch("/api/lab-report-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: String(inspectionId),
          kind: "radon",
          filename: file.name,
        }),
      });
      const info = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(info?.error || "Upload failed.");
      if (!info?.token || !info?.path) throw new Error("Could not start the upload.");

      const { error: uploadError } = await supabase.storage
        .from("lab-reports")
        .uploadToSignedUrl(info.path, info.token, file, {
          contentType: "application/pdf",
        });
      if (uploadError) throw uploadError;

      if (!info.url) throw new Error("Uploaded, but no link came back.");
      onChange(info.url);
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label>
      <span className="text-sm font-bold text-[var(--fl-muted)]">
        Official Report (upload PDF or paste a link)
      </span>
      <input
        type="text"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Upload the PDF, or paste a link"
        className="mt-2 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 rounded-lg border border-teal-500/50 px-3 py-2 text-sm font-bold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10 ${
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
            className="text-sm font-bold text-[var(--fl-accent-text)] underline"
          >
            View current
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs font-bold text-[var(--fl-crit-text)]">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-[var(--fl-faint)]">
          Remember to Save after uploading.
        </p>
      )}
    </label>
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
      <span className="text-sm font-bold text-[var(--fl-muted)]">{label}</span>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)]"
      />
    </label>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-[var(--fl-muted)]">{label}</span>
      <input
        type="datetime-local"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)]"
      />
    </label>
  );
}

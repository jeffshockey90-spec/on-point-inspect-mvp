"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

type ImportMode = "pdf" | "spectora";

type ImportedFinding = {
  section: string;
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
  severity: string;
};

type ParsedReport = {
  reportType: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  realtorName: string;
  realtorEmail: string;
  realtorPhone: string;
  inspectionDate: string;
  findings: ImportedFinding[];
  rawTextPreview?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  coverPhotoUrl?: string;
  spectoraReportId?: string;
  spectoraInspectionId?: string;
};

const EMPTY_PARSED_REPORT: ParsedReport = {
  reportType: "PDF",
  propertyAddress: "",
  city: "",
  state: "",
  zip: "",
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  realtorName: "",
  realtorEmail: "",
  realtorPhone: "",
  inspectionDate: "",
  findings: [],
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSeverity(value: string) {
  const clean = String(value || "").toLowerCase();

  if (clean.includes("safety") || clean.includes("hazard") || clean.includes("major")) {
    return "Safety Concern";
  }

  if (clean.includes("maintenance") || clean.includes("monitor")) {
    return "Maintenance";
  }

  if (clean.includes("information") || clean.includes("informational")) {
    return "Informational";
  }

  return "Recommended Repair";
}

export default function ImportReportPage() {
  const router = useRouter();
  const supabase = createClient();

  const [importMode, setImportMode] = useState<ImportMode>("spectora");
  const [file, setFile] = useState<File | null>(null);
  const [spectoraUrl, setSpectoraUrl] = useState("");
  const [parsedReport, setParsedReport] = useState<ParsedReport>(EMPTY_PARSED_REPORT);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeFindings = useMemo(
    () =>
      (parsedReport.findings || []).filter(
        (finding) =>
          finding.title.trim() ||
          finding.observation.trim() ||
          finding.recommendation.trim()
      ),
    [parsedReport.findings]
  );

  function updateReportField(field: keyof ParsedReport, value: string) {
    setParsedReport((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateFinding(index: number, field: keyof ImportedFinding, value: string) {
    setParsedReport((current) => {
      const findings = [...(current.findings || [])];

      findings[index] = {
        ...findings[index],
        [field]: value,
      };

      return {
        ...current,
        findings,
      };
    });
  }

  function removeFinding(index: number) {
    setParsedReport((current) => ({
      ...current,
      findings: (current.findings || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function getCompanyIdForUser(userId: string) {
    const { data, error } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .single();

    if (error || !data?.company_id) {
      throw new Error("No company is linked to this account.");
    }

    return data.company_id;
  }

  function applyParsedReport(data: any) {
    setParsedReport({
      ...EMPTY_PARSED_REPORT,
      ...data.report,
      findings: (data.report?.findings || []).map((finding: ImportedFinding) => ({
        section: finding.section || "Inspection Details",
        title: finding.title || "Imported Finding",
        observation: finding.observation || "",
        implication: finding.implication || "",
        recommendation: finding.recommendation || "",
        severity: normalizeSeverity(finding.severity),
      })),
    });
  }

  async function parsePdfReport() {
    if (!file) {
      setErrorMessage("Choose a PDF report first.");
      return;
    }

    try {
      setErrorMessage("");
      setParsing(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import-report/parse", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Could not parse report.");
      }

      applyParsedReport(data);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not parse report.");
    } finally {
      setParsing(false);
    }
  }

  async function parseSpectoraReport() {
    if (!spectoraUrl.trim()) {
      setErrorMessage("Paste a Spectora report link first.");
      return;
    }

    try {
      setErrorMessage("");
      setParsing(true);

      const res = await fetch("/api/import-report/spectora", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: spectoraUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Could not import Spectora report.");
      }

      applyParsedReport(data);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not import Spectora report.");
    } finally {
      setParsing(false);
    }
  }

  async function createImportedInspection() {
    try {
      setErrorMessage("");
      setCreating(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const companyId = await getCompanyIdForUser(user.id);
      const inspectionDate = parsedReport.inspectionDate || todayString();

      const importNotes = [
        `Imported from ${parsedReport.reportType || "PDF"} report. Review all findings before publishing.`,
        parsedReport.sourceUrl ? `Spectora source: ${parsedReport.sourceUrl}` : "",
        parsedReport.pdfUrl ? `Original PDF: ${parsedReport.pdfUrl}` : "",
        parsedReport.coverPhotoUrl ? `Cover photo: ${parsedReport.coverPhotoUrl}` : "",
        parsedReport.spectoraReportId ? `Spectora report ID: ${parsedReport.spectoraReportId}` : "",
        parsedReport.spectoraInspectionId ? `Spectora inspection ID: ${parsedReport.spectoraInspectionId}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: inspection, error: inspectionError } = await supabase
        .from("inspections")
        .insert([
          {
            inspector_id: user.id,
            company_id: companyId,

            client_name: parsedReport.clientName || "Imported Client",
            client_email: parsedReport.clientEmail.trim().toLowerCase() || null,
            client_phone: parsedReport.clientPhone || null,

            realtor_name: parsedReport.realtorName || null,
            realtor_email: parsedReport.realtorEmail.trim().toLowerCase() || null,
            realtor_phone: parsedReport.realtorPhone || null,
            agent_name: parsedReport.realtorName || null,
            agent_email: parsedReport.realtorEmail.trim().toLowerCase() || null,

            property_address: parsedReport.propertyAddress || "Imported Report",
            address: parsedReport.propertyAddress || "Imported Report",
            city: parsedReport.city || null,
            state: parsedReport.state || null,
            zip: parsedReport.zip || null,

            inspection_date: inspectionDate,
            inspection_time: "10:00",
            inspection_status: "Imported Draft",

            price: 0,
            invoice_amount: 0,
            balance_due: 0,
            amount_paid: 0,
            invoice_status: "Not Required",
            payment_status: "Not Required",

            services: "Imported Report",
            service_mode: "home",
            inspection_type: "Imported Report",
            notes: importNotes,

            report_status: "Draft",
            is_published: false,
            published: false,
          },
        ])
        .select()
        .single();

      if (inspectionError) {
        throw new Error(inspectionError.message);
      }

      const findingsToInsert = activeFindings.map((finding) => ({
        inspection_id: inspection.id,
        inspector_id: user.id,
        company_id: companyId,
        section: finding.section || "Inspection Details",
        title: finding.title || "Imported Finding",
        observation: finding.observation || "",
        implication: finding.implication || "",
        recommendation: finding.recommendation || "",
        severity: normalizeSeverity(finding.severity),
      }));

      if (findingsToInsert.length > 0) {
        const { error: findingsError } = await supabase
          .from("findings")
          .insert(findingsToInsert);

        if (findingsError) {
          throw new Error(findingsError.message);
        }
      }

      const inspectionContacts = [];

      if (parsedReport.clientEmail.trim()) {
        inspectionContacts.push({
          inspection_id: inspection.id,
          inspector_id: user.id,
          name: parsedReport.clientName || "Imported Client",
          email: parsedReport.clientEmail.trim().toLowerCase(),
          phone: parsedReport.clientPhone || null,
          role: "client",
          agreement_required: false,
          portal_access: true,
        });
      }

      if (parsedReport.realtorEmail.trim()) {
        inspectionContacts.push({
          inspection_id: inspection.id,
          inspector_id: user.id,
          name: parsedReport.realtorName || "Realtor",
          email: parsedReport.realtorEmail.trim().toLowerCase(),
          phone: parsedReport.realtorPhone || null,
          role: "realtor",
          agreement_required: false,
          portal_access: true,
        });
      }

      if (inspectionContacts.length > 0) {
        const { error: contactsError } = await supabase
          .from("inspection_contacts")
          .insert(inspectionContacts);

        if (contactsError) {
          console.warn("Imported inspection contacts were not inserted.");
        }
      }

      router.push(`/reports/${inspection.id}`);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not create imported inspection.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-300">
            On Point Inspect 1.5
          </p>

          <h1 className="mt-2 text-4xl font-black text-white md:text-5xl">
            Import Report
          </h1>

          <p className="mt-3 max-w-3xl text-slate-300">
            Upload a legacy PDF or paste a public Spectora report link and convert it into a new On Point Inspect draft. This optional importer does not change your normal report workflow.
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-amber-100">
          <h2 className="text-xl font-black">Safe Import Rules</h2>
          <p className="mt-2 leading-7">
            Imported reports are created as drafts only. Nothing is published, emailed, invoiced, or sent to the client automatically.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
          <div className="mb-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setImportMode("spectora");
                setErrorMessage("");
              }}
              className={`rounded-xl border px-5 py-3 font-black ${
                importMode === "spectora"
                  ? "border-teal-400 bg-teal-500 text-black"
                  : "border-slate-700 bg-black text-slate-200"
              }`}
            >
              Import Spectora Link
            </button>

            <button
              type="button"
              onClick={() => {
                setImportMode("pdf");
                setErrorMessage("");
              }}
              className={`rounded-xl border px-5 py-3 font-black ${
                importMode === "pdf"
                  ? "border-amber-400 bg-amber-500 text-black"
                  : "border-slate-700 bg-black text-slate-200"
              }`}
            >
              Upload PDF
            </button>
          </div>

          {importMode === "spectora" ? (
            <div>
              <h2 className="text-2xl font-bold text-teal-300">
                1. Paste Spectora Report Link
              </h2>

              <input
                value={spectoraUrl}
                onChange={(event) => setSpectoraUrl(event.target.value)}
                placeholder="https://reports.spectora.com/v/reports/..."
                className="mt-4 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
              />

              <button
                type="button"
                onClick={parseSpectoraReport}
                disabled={parsing || !spectoraUrl.trim()}
                className="mt-4 rounded-xl bg-teal-500 px-6 py-3 font-black text-black hover:bg-teal-400 disabled:opacity-50"
              >
                {parsing ? "Importing Spectora Report..." : "Import Spectora Report"}
              </button>

              <p className="mt-3 text-sm text-slate-400">
                This uses the public Spectora report link and the linked PDF to build a native On Point Inspect draft.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-amber-300">1. Upload PDF</h2>

              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-4 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white"
              />

              <button
                type="button"
                onClick={parsePdfReport}
                disabled={parsing || !file}
                className="mt-4 rounded-xl bg-amber-500 px-6 py-3 font-black text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {parsing ? "Reading PDF..." : "Parse PDF Report"}
              </button>
            </div>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
              {errorMessage}
            </p>
          )}
        </section>

        {(parsedReport.rawTextPreview || activeFindings.length > 0) && (
          <>
            <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <h2 className="text-2xl font-bold text-teal-300">
                2. Review Imported Inspection Info
              </h2>

              {parsedReport.coverPhotoUrl && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-black">
                  <img
                    src={parsedReport.coverPhotoUrl}
                    alt="Imported property cover"
                    className="h-56 w-full object-cover"
                  />
                </div>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Input
                  label="Report Type"
                  value={parsedReport.reportType}
                  onChange={(value) => updateReportField("reportType", value)}
                />

                <Input
                  label="Inspection Date"
                  value={parsedReport.inspectionDate}
                  onChange={(value) => updateReportField("inspectionDate", value)}
                />

                <Input
                  label="Property Address"
                  value={parsedReport.propertyAddress}
                  onChange={(value) => updateReportField("propertyAddress", value)}
                />

                <Input
                  label="City"
                  value={parsedReport.city}
                  onChange={(value) => updateReportField("city", value)}
                />

                <Input
                  label="State"
                  value={parsedReport.state}
                  onChange={(value) => updateReportField("state", value)}
                />

                <Input
                  label="Zip"
                  value={parsedReport.zip}
                  onChange={(value) => updateReportField("zip", value)}
                />

                <Input
                  label="Client Name"
                  value={parsedReport.clientName}
                  onChange={(value) => updateReportField("clientName", value)}
                />

                <Input
                  label="Client Email"
                  value={parsedReport.clientEmail}
                  onChange={(value) => updateReportField("clientEmail", value)}
                />

                <Input
                  label="Client Phone"
                  value={parsedReport.clientPhone}
                  onChange={(value) => updateReportField("clientPhone", value)}
                />

                <Input
                  label="Realtor Name"
                  value={parsedReport.realtorName}
                  onChange={(value) => updateReportField("realtorName", value)}
                />

                <Input
                  label="Realtor Email"
                  value={parsedReport.realtorEmail}
                  onChange={(value) => updateReportField("realtorEmail", value)}
                />

                <Input
                  label="Realtor Phone"
                  value={parsedReport.realtorPhone}
                  onChange={(value) => updateReportField("realtorPhone", value)}
                />
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-teal-300">
                    3. Review Findings
                  </h2>
                  <p className="mt-1 text-slate-400">
                    {activeFindings.length} finding{activeFindings.length === 1 ? "" : "s"} found. Edit or remove anything before creating the draft.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={createImportedInspection}
                  disabled={creating || activeFindings.length === 0}
                  className="rounded-xl bg-teal-500 px-6 py-3 font-black text-black hover:bg-teal-400 disabled:opacity-50"
                >
                  {creating ? "Creating Draft..." : "Create Imported Draft"}
                </button>
              </div>

              <div className="mt-5 space-y-5">
                {parsedReport.findings.map((finding, index) => (
                  <div
                    key={`${finding.title}-${index}`}
                    className="rounded-2xl border border-slate-700 bg-[#020617] p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-black uppercase tracking-wide text-amber-300">
                        Imported Finding #{index + 1}
                      </p>

                      <button
                        type="button"
                        onClick={() => removeFinding(index)}
                        className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Section"
                        value={finding.section}
                        onChange={(value) => updateFinding(index, "section", value)}
                      />

                      <Input
                        label="Severity"
                        value={finding.severity}
                        onChange={(value) => updateFinding(index, "severity", value)}
                      />

                      <Input
                        label="Title"
                        value={finding.title}
                        onChange={(value) => updateFinding(index, "title", value)}
                      />
                    </div>

                    <Textarea
                      label="Observation"
                      value={finding.observation}
                      onChange={(value) => updateFinding(index, "observation", value)}
                    />

                    <Textarea
                      label="Implication"
                      value={finding.implication}
                      onChange={(value) => updateFinding(index, "implication", value)}
                    />

                    <Textarea
                      label="Recommendation"
                      value={finding.recommendation}
                      onChange={(value) => updateFinding(index, "recommendation", value)}
                    />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>
      <input
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>
      <textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}

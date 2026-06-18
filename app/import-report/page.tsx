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
  image_url?: string;
  photos?: string[];
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
  propertyDetails?: ImportedFinding[];
  rawTextPreview?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  coverPhotoUrl?: string;
  spectoraReportId?: string;
  spectoraInspectionId?: string;
  importerStatus?: string;
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
  propertyDetails: [],
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

function normalizeImportedFinding(finding: ImportedFinding): ImportedFinding {
  const photos = Array.from(
    new Set([...(finding.photos || []), finding.image_url].filter(Boolean))
  ) as string[];

  return {
    section: finding.section || "Inspection Details",
    title: finding.title || "Imported Finding",
    observation: finding.observation || "",
    implication: finding.implication || "",
    recommendation: finding.recommendation || "",
    severity: normalizeSeverity(finding.severity),
    image_url: finding.image_url || photos?.[0] || "",
    photos,
  };
}

function cleanDisplayLabel(value: string) {
  return String(value || "")
    .replace(/^[^:]+:\s*/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function photoSet(finding: ImportedFinding) {
  return Array.from(
    new Set([finding.image_url, ...(finding.photos || [])].filter(Boolean))
  ) as string[];
}

function isWorthShowingDetail(detail: ImportedFinding) {
  const title = cleanDisplayLabel(detail.title || "");
  const text = String(detail.observation || "").trim();

  if (!title && !text && !photoSet(detail).length) return false;
  if (title.toLowerCase().includes("chimney disclaimer")) return false;
  if (text.length > 500 && !photoSet(detail).length) return false;

  return true;
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
          normalizeSeverity(finding.severity) !== "Informational" &&
          (finding.title.trim() ||
            finding.observation.trim() ||
            finding.recommendation.trim() ||
            (finding.photos || []).length > 0)
      ),
    [parsedReport.findings]
  );

  const propertyDetails = useMemo(
    () =>
      (parsedReport.propertyDetails || [])
        .map(normalizeImportedFinding)
        .filter(isWorthShowingDetail),
    [parsedReport.propertyDetails]
  );

  const photoCount = useMemo(
    () => activeFindings.reduce((total, finding) => total + photoSet(finding).length, 0),
    [activeFindings]
  );

  const groupedPropertyDetails = useMemo(() => {
    const groups: Record<string, ImportedFinding[]> = {};

    for (const detail of propertyDetails) {
      const section = detail.section || "Inspection Details";
      if (!groups[section]) groups[section] = [];
      groups[section].push(detail);
    }

    return groups;
  }, [propertyDetails]);

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
    const findingToRemove = activeFindings[index];

    setParsedReport((current) => ({
      ...current,
      findings: (current.findings || []).filter((finding) => finding !== findingToRemove),
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
    const normalizedFindings = (data.report?.findings || []).map(normalizeImportedFinding);
    const normalizedDetails = (data.report?.propertyDetails || []).map(normalizeImportedFinding);

    setParsedReport({
      ...EMPTY_PARSED_REPORT,
      ...data.report,
      findings: normalizedFindings,
      propertyDetails: normalizedDetails,
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

      const detailsText = propertyDetails
        .map((detail) => `${detail.section} - ${detail.title}: ${detail.observation}`)
        .join("\n");

      const importNotes = [
        `Imported from ${parsedReport.reportType || "PDF"} report. Review all findings before publishing.`,
        parsedReport.importerStatus || "",
        detailsText ? `\nImported Inspection Information:\n${detailsText}` : "",
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
        image_url: finding.image_url || finding.photos?.[0] || null,
      }));

      let insertedFindings: any[] = [];

      if (findingsToInsert.length > 0) {
        const { data: findingsData, error: findingsError } = await supabase
          .from("findings")
          .insert(findingsToInsert)
          .select("id, inspection_id, section, title, image_url");

        if (findingsError) {
          throw new Error(findingsError.message);
        }

        insertedFindings = findingsData || [];
      }

      const photoRows: any[] = [];

      insertedFindings.forEach((insertedFinding, index) => {
        const sourceFinding = activeFindings[index];
        const urls = photoSet(sourceFinding);

        urls.forEach((url) => {
          photoRows.push({
            inspection_id: String(inspection.id),
            finding_id: String(insertedFinding.id),
            company_id: companyId,
            public_url: url,
            thumbnail_url: url,
          });
        });
      });

      if (photoRows.length > 0) {
        const { error: photoError } = await supabase.from("photos").insert(photoRows);

        if (photoError) {
          console.warn("Imported Spectora photos were not inserted:", photoError.message);
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
                This uses the public Spectora report link to build a native On Point Inspect draft.
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

        {(parsedReport.rawTextPreview || activeFindings.length > 0 || propertyDetails.length > 0) && (
          <>
            <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <h2 className="text-2xl font-bold text-teal-300">
                2. Review Imported Inspection Info
              </h2>

              {parsedReport.coverPhotoUrl && (
                <a
                  href={parsedReport.coverPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 block rounded-2xl border border-slate-700 bg-black p-3"
                  title="Open full cover photo"
                >
                  <img
                    src={parsedReport.coverPhotoUrl}
                    alt="Imported property cover"
                    className="mx-auto max-h-[420px] w-auto max-w-full rounded-xl object-contain"
                  />
                </a>
              )}

              {parsedReport.importerStatus && (
                <p className="mt-4 rounded-xl border border-teal-500/40 bg-teal-500/10 p-3 text-sm text-teal-100">
                  {parsedReport.importerStatus} Finding photos detected: {photoCount}. Section info items detected: {propertyDetails.length}.
                </p>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Input label="Report Type" value={parsedReport.reportType} onChange={(value) => updateReportField("reportType", value)} />
                <Input label="Inspection Date" value={parsedReport.inspectionDate} onChange={(value) => updateReportField("inspectionDate", value)} />
                <Input label="Property Address" value={parsedReport.propertyAddress} onChange={(value) => updateReportField("propertyAddress", value)} />
                <Input label="City" value={parsedReport.city} onChange={(value) => updateReportField("city", value)} />
                <Input label="State" value={parsedReport.state} onChange={(value) => updateReportField("state", value)} />
                <Input label="Zip" value={parsedReport.zip} onChange={(value) => updateReportField("zip", value)} />
                <Input label="Client Name" value={parsedReport.clientName} onChange={(value) => updateReportField("clientName", value)} />
                <Input label="Client Email" value={parsedReport.clientEmail} onChange={(value) => updateReportField("clientEmail", value)} />
                <Input label="Client Phone" value={parsedReport.clientPhone} onChange={(value) => updateReportField("clientPhone", value)} />
                <Input label="Realtor Name" value={parsedReport.realtorName} onChange={(value) => updateReportField("realtorName", value)} />
                <Input label="Realtor Email" value={parsedReport.realtorEmail} onChange={(value) => updateReportField("realtorEmail", value)} />
                <Input label="Realtor Phone" value={parsedReport.realtorPhone} onChange={(value) => updateReportField("realtorPhone", value)} />
              </div>
            </section>

            {propertyDetails.length > 0 && (
              <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
                <h2 className="text-2xl font-bold text-teal-300">
                  Imported Section Information
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  These are Spectora information/details items. They will be saved into the imported draft notes, not as defect findings.
                </p>

                <div className="mt-5 space-y-5">
                  {Object.entries(groupedPropertyDetails).map(([section, details]) => (
                    <div key={section} className="rounded-2xl border border-slate-700 bg-[#020617] p-4">
                      <h3 className="text-lg font-black text-white">{section}</h3>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {details.map((detail, index) => (
                          <div
                            key={`${detail.title}-${index}`}
                            className="min-h-[92px] rounded-xl border border-slate-700 bg-[#0f172a] p-3"
                          >
                            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                              {cleanDisplayLabel(detail.title)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-5 text-white">
                              {detail.observation || "Imported detail"}
                            </p>

                            {photoSet(detail).length > 0 && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                {photoSet(detail).slice(0, 4).map((photoUrl, photoIndex) => (
                                  <a
                                    key={`${photoUrl}-${photoIndex}`}
                                    href={photoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-slate-700 bg-black p-1"
                                    title="Open full photo"
                                  >
                                    <img
                                      src={photoUrl}
                                      alt="Imported detail photo"
                                      className="mx-auto max-h-36 w-auto max-w-full rounded-md object-contain"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-teal-300">
                    3. Review Findings
                  </h2>
                  <p className="mt-1 text-slate-400">
                    {activeFindings.length} finding{activeFindings.length === 1 ? "" : "s"} found. Photos detected: {photoCount}. Click any photo to open the full image.
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
                {activeFindings.map((finding, index) => (
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

                    {photoSet(finding).length > 0 && (
                      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {photoSet(finding).slice(0, 12).map((photoUrl, photoIndex) => (
                          <a
                            key={`${photoUrl}-${photoIndex}`}
                            href={photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-slate-700 bg-black p-2"
                            title="Open full photo"
                          >
                            <img
                              src={photoUrl}
                              alt="Imported Spectora photo"
                              className="mx-auto max-h-[420px] w-auto max-w-full rounded-lg object-contain"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-3">
                      <Input label="Section" value={finding.section} onChange={(value) => updateFinding(index, "section", value)} />
                      <Input label="Severity" value={finding.severity} onChange={(value) => updateFinding(index, "severity", value)} />
                      <Input label="Title" value={finding.title} onChange={(value) => updateFinding(index, "title", value)} />
                    </div>

                    <Textarea label="Observation" value={finding.observation} onChange={(value) => updateFinding(index, "observation", value)} />
                    <Textarea label="Implication" value={finding.implication} onChange={(value) => updateFinding(index, "implication", value)} />
                    <Textarea label="Recommendation" value={finding.recommendation} onChange={(value) => updateFinding(index, "recommendation", value)} />
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

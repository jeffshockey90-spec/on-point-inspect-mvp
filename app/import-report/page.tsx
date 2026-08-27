"use client";


import { currentLocalDate } from "../../lib/app-time";
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
  return currentLocalDate();
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
  const lowerTitle = title.toLowerCase();
  const lowerText = text.toLowerCase();

  if (!title && !text && !photoSet(detail).length) return false;
  if (lowerTitle.includes("chimney disclaimer")) return false;
  if (lowerTitle.includes("not tested due to weather")) return false;
  if (lowerText.includes("regular maintenance and annual professional servicing")) return false;
  if (lowerText.includes("typical service life")) return false;
  if (lowerText.includes("budgeting for eventual replacement")) return false;
  if (text.length > 420 && !photoSet(detail).length) return false;

  return true;
}

function simplifyDetailObservation(detail: ImportedFinding) {
  const text = String(detail.observation || "").trim();
  const title = cleanDisplayLabel(detail.title || "");

  if (!text) return "";

  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length > 220) {
    if (title.toLowerCase().includes("brand")) {
      const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
      return firstSentence.slice(0, 180).trim();
    }

    return normalized.slice(0, 220).trim() + "…";
  }

  return normalized;
}

function samePhotoGroup(a: ImportedFinding, b: ImportedFinding) {
  const aPhotos = photoSet(a);
  const bPhotos = photoSet(b);

  if (!aPhotos.length || !bPhotos.length) return false;

  return aPhotos.some((photo) => bPhotos.includes(photo));
}

function detailMergeKey(detail: ImportedFinding) {
  const section = String(detail.section || "").trim().toLowerCase();
  const title = cleanDisplayLabel(detail.title || "").trim().toLowerCase();
  const shortText = simplifyDetailObservation(detail).toLowerCase();

  if (title.includes("brand") && photoSet(detail).length) {
    return `${section}::equipment-brand::${photoSet(detail).sort().join("|")}`;
  }

  if (title.includes("garbage disposal") && photoSet(detail).length) {
    return `${section}::garbage-disposal::${photoSet(detail).sort().join("|")}`;
  }

  if (title.includes("range") && photoSet(detail).length) {
    return `${section}::range-oven::${photoSet(detail).sort().join("|")}`;
  }

  return `${section}::${title}::${shortText}`;
}

function dedupeImportedDetails(details: ImportedFinding[]) {
  const byKey = new Map<string, ImportedFinding>();

  for (const rawDetail of details) {
    const detail = {
      ...rawDetail,
      observation: simplifyDetailObservation(rawDetail),
      photos: photoSet(rawDetail),
      image_url: photoSet(rawDetail)[0] || "",
    };

    const key = detailMergeKey(detail);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, detail);
      continue;
    }

    const mergedPhotos = Array.from(new Set([...photoSet(existing), ...photoSet(detail)]));
    const betterObservation =
      String(existing.observation || "").length <= String(detail.observation || "").length
        ? existing.observation
        : detail.observation;

    byKey.set(key, {
      ...existing,
      observation: betterObservation,
      photos: mergedPhotos,
      image_url: mergedPhotos[0] || "",
    });
  }

  const merged = Array.from(byKey.values());
  const output: ImportedFinding[] = [];

  for (const detail of merged) {
    const duplicateIndex = output.findIndex(
      (existing) =>
        String(existing.section || "").toLowerCase() === String(detail.section || "").toLowerCase() &&
        samePhotoGroup(existing, detail)
    );

    if (duplicateIndex >= 0) {
      const existing = output[duplicateIndex];
      const mergedPhotos = Array.from(new Set([...photoSet(existing), ...photoSet(detail)]));
      output[duplicateIndex] = {
        ...existing,
        photos: mergedPhotos,
        image_url: mergedPhotos[0] || "",
      };
      continue;
    }

    output.push(detail);
  }

  return output;
}

function dedupeImportedFindings(findings: ImportedFinding[]) {
  const seen = new Set<string>();
  const output: ImportedFinding[] = [];

  for (const finding of findings) {
    const section = String(finding.section || "").trim().toLowerCase();
    const title = String(finding.title || "").trim().toLowerCase();
    const observation = String(finding.observation || "").trim().toLowerCase();
    const photos = photoSet(finding).sort().join("|");
    const key = `${section}::${title}::${observation.slice(0, 160)}::${photos}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...finding,
      photos: photoSet(finding),
      image_url: photoSet(finding)[0] || finding.image_url || "",
    });
  }

  return output;
}


type EquipmentGroup = {
  section: string;
  name: string;
  fields: Record<string, string>;
  photos: string[];
};

const EQUIPMENT_SECTION_NAMES = [
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Built-in Appliances",
  "Garage",
];

function isEquipmentSection(section: string) {
  return EQUIPMENT_SECTION_NAMES.some(
    (name) => name.toLowerCase() === String(section || "").toLowerCase()
  );
}

function equipmentTypeForDetail(detail: ImportedFinding) {
  const section = String(detail.section || "");
  const title = cleanDisplayLabel(detail.title || "").toLowerCase();
  const text = String(detail.observation || "").toLowerCase();

  if (section === "Heating") return "Heating Equipment";
  if (section === "Cooling") return "Cooling Equipment";

  if (section === "Plumbing") {
    if (
      title.includes("capacity") ||
      title.includes("manufacturer") ||
      title.includes("power source") ||
      title.includes("energy source") ||
      title.includes("fuel") ||
      text.includes("gallon")
    ) {
      return "Water Heater";
    }

    return "Plumbing";
  }

  if (section === "Electrical") return "Electrical System";

  if (section === "Built-in Appliances") {
    if (title.includes("range") || title.includes("oven")) return "Range/Oven";
    if (title.includes("garbage disposal")) return "Garbage Disposal";
    if (title.includes("exhaust hood")) return "Exhaust Hood";
    if (title.includes("dishwasher")) return "Dishwasher";
    if (title.includes("brand")) return "Appliances";
    return "Built-in Appliances";
  }

  if (section === "Garage") {
    if (title.includes("opener")) return "Garage Door Opener";
    return "Garage";
  }

  return section || "Equipment";
}

function normalizedFieldLabel(detail: ImportedFinding) {
  const raw = cleanDisplayLabel(detail.title || "");
  const lower = raw.toLowerCase();

  if (lower.includes("range") && lower.includes("brand")) return "Range/Oven Brand";
  if (lower.includes("garbage disposal")) return "Garbage Disposal";
  if (lower.includes("exhaust hood")) return "Exhaust Hood Type";
  if (lower.includes("power source")) return "Power Source";
  if (lower.includes("energy source")) return "Energy Source";
  if (lower.includes("supply material")) return "Water Supply Material";
  if (lower.includes("distribution material")) return "Distribution Material";
  if (lower.includes("drain size")) return "Drain Size";
  if (lower.includes("water source")) return "Water Source";
  if (lower.includes("fuel")) return "Fuel";
  if (lower.includes("capacity")) return "Capacity";
  if (lower.includes("manufacturer")) return "Manufacturer";
  if (lower.includes("location")) return "Location";
  if (lower.includes("seer")) return "SEER Rating";
  if (lower.includes("afue")) return "AFUE Rating";
  if (lower.includes("brand")) return "Brand";
  if (lower.includes("material")) return "Material";
  if (lower.includes("type")) return "Type";

  return raw || "Detail";
}

function fieldValueForDetail(detail: ImportedFinding) {
  const value = simplifyDetailObservation(detail);
  const title = cleanDisplayLabel(detail.title || "");

  if (!value) return "";

  // Remove repeated title from values when Spectora text embeds it.
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`^${escaped}\\s*:?\\s*`, "i"), "").trim();
}

function groupEquipmentDetails(details: ImportedFinding[]) {
  const groups = new Map<string, EquipmentGroup>();
  const passthrough: ImportedFinding[] = [];

  for (const detail of details) {
    if (!isEquipmentSection(detail.section)) {
      passthrough.push(detail);
      continue;
    }

    const section = detail.section || "Equipment";
    const name = equipmentTypeForDetail(detail);
    const key = `${section}::${name}`;
    const label = normalizedFieldLabel(detail);
    const value = fieldValueForDetail(detail);
    const photos = photoSet(detail);

    if (!groups.has(key)) {
      groups.set(key, {
        section,
        name,
        fields: {},
        photos: [],
      });
    }

    const group = groups.get(key)!;

    if (value) {
      const existing = group.fields[label];

      // Keep the shorter, cleaner duplicate value.
      if (!existing || value.length < existing.length) {
        group.fields[label] = value;
      }
    }

    group.photos = Array.from(new Set([...group.photos, ...photos]));
  }

  return {
    equipmentGroups: Array.from(groups.values()),
    passthroughDetails: passthrough,
  };
}


export default function ImportReportPage() {
  const router = useRouter();
  const supabase = createClient();

  const [importMode, setImportMode] = useState<ImportMode>("spectora");
  const [file, setFile] = useState<File | null>(null);
  const [spectoraUrl, setSpectoraUrl] = useState("");
  const [parsedReport, setParsedReport] = useState<ParsedReport>(EMPTY_PARSED_REPORT);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState<false | "draft" | "demo">(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeFindings = useMemo(
    () =>
      dedupeImportedFindings(
        (parsedReport.findings || []).filter(
          (finding) =>
            normalizeSeverity(finding.severity) !== "Informational" &&
            (finding.title.trim() ||
              finding.observation.trim() ||
              finding.recommendation.trim() ||
              (finding.photos || []).length > 0)
        )
      ),
    [parsedReport.findings]
  );

  const propertyDetails = useMemo(
    () =>
      dedupeImportedDetails(
        (parsedReport.propertyDetails || [])
          .map(normalizeImportedFinding)
          .filter(isWorthShowingDetail)
      ),
    [parsedReport.propertyDetails]
  );

  const photoCount = useMemo(
    () => activeFindings.reduce((total, finding) => total + photoSet(finding).length, 0),
    [activeFindings]
  );

  const { equipmentGroups, passthroughDetails } = useMemo(
    () => groupEquipmentDetails(propertyDetails),
    [propertyDetails]
  );

  const groupedPropertyDetails = useMemo(() => {
    const groups: Record<string, ImportedFinding[]> = {};

    for (const detail of passthroughDetails) {
      const section = detail.section || "Inspection Details";
      if (!groups[section]) groups[section] = [];
      groups[section].push(detail);
    }

    return groups;
  }, [passthroughDetails]);

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
    const normalizedFindings = dedupeImportedFindings(
      (data.report?.findings || []).map(normalizeImportedFinding)
    );

    const normalizedDetails = dedupeImportedDetails(
      (data.report?.propertyDetails || []).map(normalizeImportedFinding)
    );

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

  async function createImportedInspection(saveAsDemo = false) {
    try {
      setErrorMessage("");
      setCreating(saveAsDemo ? "demo" : "draft");

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
        saveAsDemo ? "Saved as public demo/sample report." : "",
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

      const demoAddress = parsedReport.propertyAddress || "Sample Demo Report";
      const demoCity = parsedReport.city || null;
      const demoState = parsedReport.state || null;
      const demoZip = parsedReport.zip || null;

      const { data: inspection, error: inspectionError } = await supabase
        .from("inspections")
        .insert([
          {
            inspector_id: user.id,
            company_id: companyId,

            client_name: saveAsDemo ? "Sample Client" : parsedReport.clientName || "Imported Client",
            client_email: saveAsDemo ? null : parsedReport.clientEmail.trim().toLowerCase() || null,
            client_phone: saveAsDemo ? null : parsedReport.clientPhone || null,

            realtor_name: saveAsDemo ? "Sample Realtor" : parsedReport.realtorName || null,
            realtor_email: saveAsDemo ? null : parsedReport.realtorEmail.trim().toLowerCase() || null,
            realtor_phone: saveAsDemo ? null : parsedReport.realtorPhone || null,
            agent_name: saveAsDemo ? "Sample Realtor" : parsedReport.realtorName || null,
            agent_email: saveAsDemo ? null : parsedReport.realtorEmail.trim().toLowerCase() || null,

            property_address: demoAddress,
            address: demoAddress,
            city: demoCity,
            state: demoState,
            zip: demoZip,

            cover_photo_url: parsedReport.coverPhotoUrl || null,
            property_photo_url: parsedReport.coverPhotoUrl || null,
            property_image_url: parsedReport.coverPhotoUrl || null,
            image_url: parsedReport.coverPhotoUrl || null,
            photo_url: parsedReport.coverPhotoUrl || null,

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

            report_status: saveAsDemo ? "Demo" : "Draft",
            is_published: saveAsDemo,
            published: saveAsDemo,
            is_demo: saveAsDemo,
            demo_enabled: saveAsDemo,
          },
        ])
        .select()
        .single();

      if (inspectionError) {
        throw new Error(inspectionError.message);
      }

      const findingsToInsert = activeFindings.map((finding) => ({
        inspection_id: inspection.id,
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

      if (!saveAsDemo && parsedReport.clientEmail.trim()) {
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

      if (!saveAsDemo && parsedReport.realtorEmail.trim()) {
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

      if (saveAsDemo) {
        router.push(`/demo/${inspection.id}`);
        return;
      }

      router.push(`/reports/${inspection.id}`);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not create imported inspection.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--fl-warn-text)]">
            FLOW 1.5
          </p>

          <h1 className="mt-2 text-4xl font-semibold text-[var(--fl-text)] md:text-5xl">
            Import Report
          </h1>

          <p className="mt-3 max-w-3xl text-[var(--fl-muted)]">
            Upload a legacy PDF or paste a public Spectora report link and convert it into a new FLOW draft. This optional importer does not change your normal report workflow.
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-[var(--fl-warn-text)]">
          <h2 className="text-xl font-semibold">Safe Import Rules</h2>
          <p className="mt-2 leading-7">
            Imported reports are created as drafts only. Nothing is published, emailed, invoiced, or sent to the client automatically.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
          <div className="mb-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setImportMode("spectora");
                setErrorMessage("");
              }}
              className={`rounded-xl border px-5 py-3 font-semibold ${
                importMode === "spectora"
                  ? "border-teal-400 bg-teal-500 text-black"
                  : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
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
              className={`rounded-xl border px-5 py-3 font-semibold ${
                importMode === "pdf"
                  ? "border-amber-400 bg-amber-500 text-black"
                  : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
              }`}
            >
              Upload PDF
            </button>
          </div>

          {importMode === "spectora" ? (
            <div>
              <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                1. Paste Spectora Report Link
              </h2>

              <input
                value={spectoraUrl}
                onChange={(event) => setSpectoraUrl(event.target.value)}
                placeholder="https://reports.spectora.com/v/reports/..."
                className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              />

              <button
                type="button"
                onClick={parseSpectoraReport}
                disabled={parsing || !spectoraUrl.trim()}
                className="mt-4 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
              >
                {parsing ? "Importing Spectora Report..." : "Import Spectora Report"}
              </button>

              <p className="mt-3 text-sm text-[var(--fl-muted)]">
                This uses the public Spectora report link to build a native FLOW draft.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-[var(--fl-warn-text)]">1. Upload PDF</h2>

              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)]"
              />

              <button
                type="button"
                onClick={parsePdfReport}
                disabled={parsing || !file}
                className="mt-4 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {parsing ? "Reading PDF..." : "Parse PDF Report"}
              </button>
            </div>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-[var(--fl-crit-text)]">
              {errorMessage}
            </p>
          )}
        </section>

        {(parsedReport.rawTextPreview || activeFindings.length > 0 || propertyDetails.length > 0) && (
          <>
            <section className="mt-6 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
              <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                2. Review Imported Inspection Info
              </h2>

              {parsedReport.coverPhotoUrl && (
                <a
                  href={parsedReport.coverPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 block rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3"
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
                <p className="mt-4 rounded-xl border border-teal-500/40 bg-teal-500/10 p-3 text-sm text-[var(--fl-accent-text)]">
                  {parsedReport.importerStatus} Finding photos detected: {photoCount}. Section info items detected: {propertyDetails.length}.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-warn-text)]">
                    Ready to save
                  </p>
                  <p className="mt-1 text-sm text-[var(--fl-muted)]">
                    Save this import as a normal draft or as a public demo/sample report.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => createImportedInspection(false)}
                    disabled={!!creating || activeFindings.length === 0}
                    className="rounded-xl bg-teal-500 px-6 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                  >
                    {creating === "draft" ? "Creating Draft..." : "Create Imported Draft"}
                  </button>

                  <button
                    type="button"
                    onClick={() => createImportedInspection(true)}
                    disabled={!!creating || activeFindings.length === 0}
                    className="rounded-xl border border-cyan-400 bg-cyan-500/15 px-6 py-3 font-semibold text-[var(--fl-info-text)] hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    {creating === "demo" ? "Saving Demo..." : "Save as Demo Report"}
                  </button>
                </div>
              </div>

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
              <section className="mt-6 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
                <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                  Imported Section Information
                </h2>

                <p className="mt-1 text-sm text-[var(--fl-muted)]">
                  These are Spectora information/details items. They will be saved into the imported draft notes, not as defect findings.
                </p>

                <div className="mt-5 space-y-5">
                  {equipmentGroups.length > 0 && (
                    <div className="rounded-2xl border border-teal-500/40 bg-[var(--fl-ground)] p-4">
                      <h3 className="text-lg font-semibold text-[var(--fl-accent-text)]">Equipment Inventory</h3>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {equipmentGroups.map((group) => (
                          <div
                            key={`${group.section}-${group.name}`}
                            className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fl-muted)]">
                              {group.section}
                            </p>
                            <h4 className="mt-1 text-xl font-semibold text-[var(--fl-text)]">{group.name}</h4>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              {Object.entries(group.fields).map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                                    {label}
                                  </p>
                                  <p className="mt-1 break-words text-sm font-bold text-[var(--fl-text)]">
                                    {value}
                                  </p>
                                </div>
                              ))}
                            </div>

                            {group.photos.length > 0 && (
                              <div className="mt-4 grid grid-cols-2 gap-3">
                                {group.photos.slice(0, 6).map((photoUrl, photoIndex) => (
                                  <a
                                    key={`${photoUrl}-${photoIndex}`}
                                    href={photoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-2"
                                    title="Open full photo"
                                  >
                                    <img
                                      src={photoUrl}
                                      alt="Imported equipment photo"
                                      className="mx-auto max-h-40 w-auto max-w-full rounded-lg object-contain"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.entries(groupedPropertyDetails).map(([section, details]) => (
                    <div key={section} className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                      <h3 className="text-lg font-semibold text-[var(--fl-text)]">{section}</h3>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {details.map((detail, index) => (
                          <div
                            key={`${detail.title}-${index}`}
                            className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                              {cleanDisplayLabel(detail.title)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-5 text-[var(--fl-text)]">
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
                                    className="rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-1"
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

            <section className="mt-6 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                    3. Review Findings
                  </h2>
                  <p className="mt-1 text-[var(--fl-muted)]">
                    {activeFindings.length} finding{activeFindings.length === 1 ? "" : "s"} found. Photos detected: {photoCount}. Click any photo to open the full image.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => createImportedInspection(false)}
                    disabled={!!creating || activeFindings.length === 0}
                    className="rounded-xl bg-teal-500 px-6 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                  >
                    {creating === "draft" ? "Creating Draft..." : "Create Imported Draft"}
                  </button>

                  <button
                    type="button"
                    onClick={() => createImportedInspection(true)}
                    disabled={!!creating || activeFindings.length === 0}
                    className="rounded-xl border border-cyan-400 bg-cyan-500/15 px-6 py-3 font-semibold text-[var(--fl-info-text)] hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    {creating === "demo" ? "Saving Demo..." : "Save as Demo Report"}
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {activeFindings.map((finding, index) => (
                  <div
                    key={`${finding.title}-${index}`}
                    className="overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fl-muted)]">
                          {finding.section || "Inspection Details"}
                        </p>

                        <h3 className="mt-1 text-2xl font-semibold leading-tight text-[var(--fl-accent-text)]">
                          {finding.title || "Imported Finding"}
                        </h3>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${severityBadgeClass(finding.severity)}`}>
                          {finding.severity || "Recommended Repair"}
                        </span>

                        <button
                          type="button"
                          onClick={() => removeFinding(index)}
                          className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-bold text-[var(--fl-crit-text)] hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="p-4">
                      {photoSet(finding).length > 0 && (
                        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          {photoSet(finding).slice(0, 8).map((photoUrl, photoIndex) => (
                            <a
                              key={`${photoUrl}-${photoIndex}`}
                              href={photoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-2"
                              title="Open full photo"
                            >
                              <img
                                src={photoUrl}
                                alt="Imported Spectora photo"
                                className="mx-auto max-h-[460px] w-auto max-w-full rounded-lg object-contain"
                              />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="mb-4 grid gap-4 md:grid-cols-3">
                        <Input label="Section" value={finding.section} onChange={(value) => updateFinding(index, "section", value)} />
                        <Input label="Severity" value={finding.severity} onChange={(value) => updateFinding(index, "severity", value)} />
                        <Input label="Title" value={finding.title} onChange={(value) => updateFinding(index, "title", value)} />
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <NativeTextBox
                          title="Observation"
                          value={finding.observation}
                          accent="blue"
                          onChange={(value) => updateFinding(index, "observation", value)}
                        />

                        <NativeTextBox
                          title="Implication"
                          value={finding.implication}
                          accent="amber"
                          onChange={(value) => updateFinding(index, "implication", value)}
                        />

                        <NativeTextBox
                          title="Recommendation"
                          value={finding.recommendation}
                          accent="teal"
                          onChange={(value) => updateFinding(index, "recommendation", value)}
                        />
                      </div>
                    </div>
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


function severityBadgeClass(severity: string) {
  const clean = String(severity || "").toLowerCase();

  if (clean.includes("safety") || clean.includes("major")) {
    return "border-red-400/70 bg-red-500/15 text-[var(--fl-crit-text)]";
  }

  if (clean.includes("maintenance") || clean.includes("monitor")) {
    return "border-amber-400/70 bg-amber-500/15 text-[var(--fl-warn-text)]";
  }

  if (clean.includes("information")) {
    return "border-sky-400/70 bg-sky-500/15 text-[var(--fl-info-text)]";
  }

  return "border-teal-400/70 bg-teal-500/15 text-[var(--fl-accent-text)]";
}

function NativeTextBox({
  title,
  value,
  accent,
  onChange,
}: {
  title: string;
  value: string;
  accent: "blue" | "amber" | "teal";
  onChange: (value: string) => void;
}) {
  const accentClass =
    accent === "blue"
      ? "border-blue-500/50 bg-blue-500/10"
      : accent === "amber"
        ? "border-amber-500/50 bg-amber-500/10"
        : "border-teal-500/50 bg-teal-500/10";

  return (
    <label className={`block rounded-xl border p-3 ${accentClass}`}>
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-text)]">
        {title}
      </span>

      <textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        className="w-full resize-y bg-transparent text-sm font-semibold leading-6 text-[var(--fl-text)] outline-none"
      />
    </label>
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
      <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">{label}</span>
      <input
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
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
      <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">{label}</span>
      <textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
      />
    </label>
  );
}

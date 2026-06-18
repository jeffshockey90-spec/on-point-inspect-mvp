import { createRequire } from "module";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const require = createRequire(import.meta.url);

type ImportedFinding = {
  section: string;
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
  severity: string;
};

const SECTION_NUMBER_MAP: Record<string, string> = {
  "1": "Inspection Details",
  "2": "Exterior",
  "3": "Roof",
  "4": "Basement, Foundation, Crawlspace & Structure",
  "5": "Heating",
  "6": "Cooling",
  "7": "Plumbing",
  "8": "Electrical",
  "9": "Fireplace",
  "10": "Attic, Insulation & Ventilation",
  "11": "Doors, Windows & Interior",
  "12": "Built-in Appliances",
  "13": "Garage",
};

const SEVERITIES = [
  "Safety Hazard",
  "Safety Concern",
  "Major Concern",
  "Recommendation",
  "Recommended Repair",
  "Maintenance Item",
  "Maintenance",
  "Monitor",
  "Informational",
  "Information",
];

function cleanText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "f")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleCase(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bGfci\b/g, "GFCI")
    .replace(/\bAfci\b/g, "AFCI")
    .replace(/\bHvac\b/g, "HVAC")
    .replace(/\bPvc\b/g, "PVC")
    .replace(/\bOsb\b/g, "OSB");
}

function normalizeSeverity(value: string) {
  const clean = String(value || "").toLowerCase();

  if (clean.includes("safety") || clean.includes("hazard")) return "Safety Concern";
  if (clean.includes("major")) return "Major Concern";
  if (clean.includes("maintenance")) return "Maintenance";
  if (clean.includes("monitor")) return "Monitor";
  if (clean.includes("information") || clean.includes("informational")) return "Informational";

  return "Recommended Repair";
}

function normalizeSectionFromNumber(findingNumber: string) {
  const first = String(findingNumber || "").match(/^(\d+)\./)?.[1] || "";
  return SECTION_NUMBER_MAP[first] || "Inspection Details";
}

function extractReportId(value: string) {
  const clean = String(value || "").trim();

  const reportMatch = clean.match(/reports\/([a-f0-9-]{36})/i);
  if (reportMatch?.[1]) return reportMatch[1];

  const uuidMatch = clean.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  return uuidMatch?.[0] || "";
}

function splitCityStateZip(fullAddress: string) {
  const parts = String(fullAddress || "").split(",").map((part) => part.trim());
  const propertyAddress = parts[0] || "";

  let city = "";
  let state = "";
  let zip = "";

  if (parts.length >= 2) {
    city = parts[1] || "";
  }

  if (parts.length >= 3) {
    const stateZip = parts[2] || "";
    const match = stateZip.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/i);

    if (match) {
      state = match[1]?.toUpperCase() || "";
      zip = match[2] || "";
    }
  }

  return {
    propertyAddress,
    city,
    state,
    zip,
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent":
        "Mozilla/5.0 (compatible; OnPointInspectImporter/1.5; +https://on-point-inspect-mvp.vercel.app)",
      origin: "https://reports.spectora.com",
      referer: "https://reports.spectora.com/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Spectora request failed: ${response.status}`);
  }

  return response.json();
}

async function readPdfTextFromUrl(pdfUrl: string) {
  if (!pdfUrl) return "";

  const response = await fetch(pdfUrl, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; OnPointInspectImporter/1.5; +https://on-point-inspect-mvp.vercel.app)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Could not download Spectora PDF: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const result = await pdfParse(buffer);

  return cleanText(result?.text || "");
}

function extractCoverInfoFromPdfText(text: string) {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const firstDate = text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0] || "";

  let inspectionDate = "";
  if (firstDate) {
    const [month, day, year] = firstDate.split("/");
    inspectionDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  let propertyAddress = "";
  let city = "";
  let state = "";
  let zip = "";
  let clientName = "";

  const residentialIndex = lines.findIndex((line) =>
    line.toLowerCase().includes("residential report")
  );

  if (residentialIndex >= 0) {
    propertyAddress = lines[residentialIndex + 1] || "";
    const cityStateZip = lines[residentialIndex + 2] || "";
    const cityStateZipMatch = cityStateZip.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);

    if (cityStateZipMatch) {
      city = cityStateZipMatch[1] || "";
      state = cityStateZipMatch[2] || "";
      zip = cityStateZipMatch[3] || "";
    }

    clientName = lines[residentialIndex + 3] || "";
  }

  return {
    propertyAddress,
    city,
    state,
    zip,
    clientName,
    inspectionDate,
  };
}

function isFindingStart(line: string) {
  return /^\d+\.\d+\.\d+\s+/.test(String(line || "").trim());
}

function isSectionHeader(line: string) {
  return /^\d+:\s+/.test(String(line || "").trim());
}

function isNoiseLine(line: string) {
  const clean = String(line || "").trim();

  if (!clean) return true;
  if (/^Page\s+\d+\s+of\s+\d+/i.test(clean)) return true;
  if (/^1070\s+Gora/i.test(clean)) return true;
  if (/On Point Home Inspections LLC/i.test(clean)) return true;
  if (/^section-[a-z0-9-]+$/i.test(clean)) return true;
  if (/^\(click here to view on web\)$/i.test(clean)) return true;
  if (/^Video$/i.test(clean)) return true;
  if (/^Deficiencies$/i.test(clean)) return true;
  if (/^Information$/i.test(clean)) return true;
  if (/^Limitations$/i.test(clean)) return true;

  return false;
}

function splitFindingContent(raw: string) {
  const text = cleanText(raw);

  let observation = text;
  let implication = "";
  let recommendation = "";

  const implicationMatch = observation.match(/([\s\S]*?)(?:\n)?Implication:\s*([\s\S]*)/i);
  if (implicationMatch) {
    observation = implicationMatch[1].trim();
    implication = implicationMatch[2].trim();
  }

  const recommendationSource = implication || observation;
  const recommendationMatch = recommendationSource.match(/([\s\S]*?)(?:\n)?(?:Recommendation:|Recommend |Have |Repair |Replace |Install |Contact a qualified)([\s\S]*)/i);

  if (recommendationMatch) {
    const before = recommendationMatch[1].trim();
    const after = recommendationSource.slice(recommendationMatch.index || 0).trim();

    recommendation = after;

    if (implication) {
      implication = before;
    } else {
      observation = before;
    }
  }

  return {
    observation: cleanText(observation),
    implication: cleanText(implication),
    recommendation: cleanText(recommendation),
  };
}

function parseFindingsFromPdfText(text: string): ImportedFinding[] {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const findings: ImportedFinding[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!isFindingStart(line)) continue;

    const headerMatch = line.match(/^(\d+\.\d+\.\d+)\s+(.+)$/);
    if (!headerMatch) continue;

    const findingNumber = headerMatch[1];
    const component = headerMatch[2] || "";
    const section = normalizeSectionFromNumber(findingNumber);

    const contentLines: string[] = [];
    let title = "";
    let severity = "";

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor];

      if (isFindingStart(next)) break;
      if (isSectionHeader(next)) break;

      if (SEVERITIES.some((item) => item.toLowerCase() === next.toLowerCase())) {
        severity = next;
        continue;
      }

      if (isNoiseLine(next)) continue;

      if (!title && next === next.toUpperCase() && next.replace(/[^A-Z]/g, "").length >= 4) {
        title = titleCase(next);
        continue;
      }

      contentLines.push(next);
    }

    if (!title) {
      title = titleCase(component);
    }

    const { observation, implication, recommendation } = splitFindingContent(
      contentLines.join("\n")
    );

    const key = `${section}:${title}:${observation.slice(0, 40)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (!title || title.toLowerCase().includes("inspection details")) continue;

    findings.push({
      section,
      title,
      observation:
        observation ||
        "Imported from Spectora report. Review and edit this finding before publishing.",
      implication,
      recommendation,
      severity: normalizeSeverity(severity),
    });
  }

  return findings;
}

function withHttps(url: string) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Spectora importer is online. POST a public Spectora report URL to use this endpoint.",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const spectoraUrl = String(body?.url || "").trim();
    const reportId = extractReportId(spectoraUrl);

    if (!reportId) {
      return NextResponse.json(
        { error: "A valid Spectora report URL is required." },
        { status: 400 }
      );
    }

    const reportApiUrl = `https://app.spectora.com/api/v1/public/reports/${reportId}?id_token=undefined&view=stats,not_show_recommended_contractors_on_reports&read_only=true`;
    const reportJson = await fetchJson(reportApiUrl);
    const reportAttrs = reportJson?.data?.attributes || {};

    const pdfUrl = withHttps(reportAttrs.pdf_url || "");
    const coverPhotoUrl = withHttps(reportAttrs.image_url || reportAttrs.cover_photo_url || "");

    let pdfText = "";
    let pdfFindings: ImportedFinding[] = [];
    let pdfCoverInfo = {
      propertyAddress: "",
      city: "",
      state: "",
      zip: "",
      clientName: "",
      inspectionDate: "",
    };

    if (pdfUrl) {
      pdfText = await readPdfTextFromUrl(pdfUrl);
      pdfFindings = parseFindingsFromPdfText(pdfText);
      pdfCoverInfo = extractCoverInfoFromPdfText(pdfText);
    }

    return NextResponse.json({
      report: {
        reportType: "Spectora Link",
        sourceUrl: spectoraUrl,
        spectoraReportId: reportId,
        spectoraInspectionId: String(reportAttrs.inspection_id || ""),
        pdfUrl,
        coverPhotoUrl,

        propertyAddress: pdfCoverInfo.propertyAddress || "Imported Spectora Report",
        city: pdfCoverInfo.city || "",
        state: pdfCoverInfo.state || "",
        zip: pdfCoverInfo.zip || "",
        clientName: pdfCoverInfo.clientName || "",
        clientEmail: "",
        clientPhone: "",
        realtorName: "",
        realtorEmail: "",
        realtorPhone: "",
        inspectionDate: pdfCoverInfo.inspectionDate || "",

        findings: pdfFindings,
        rawTextPreview: pdfText.slice(0, 5000),
      },
    });
  } catch (error: any) {
    console.error("Spectora import error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not import this Spectora report. Confirm the report link is public and try again.",
      },
      { status: 500 }
    );
  }
}

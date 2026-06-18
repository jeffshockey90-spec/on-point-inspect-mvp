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
  image_url?: string;
  photos?: string[];
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
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li>/gi, "\n- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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

function normalizeSeverityFromSpectora(category: any, commentType: string) {
  const type = String(commentType || "").toLowerCase();

  if (type === "info") return "Informational";
  if (type === "limit") return "Informational";

  // Spectora commonly uses:
  // -1 = Maintenance Item, 0 = Recommendation, 1 = Safety Hazard
  if (category === -1 || category === "-1") return "Maintenance";
  if (category === 1 || category === "1") return "Safety Concern";

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

function withHttps(url: string) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
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

async function tryFetchJson(url: string) {
  try {
    return await fetchJson(url);
  } catch {
    return null;
  }
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

function getPhotoUrl(photo: any) {
  return withHttps(
    photo?.edited_image_url ||
      photo?.original_image_url ||
      photo?.small_edited_image_url ||
      photo?.small_image_url ||
      photo?.image ||
      photo?.photo ||
      ""
  );
}

function parseHtmlFindingText(htmlText: string) {
  const text = cleanText(htmlText);

  if (!text) {
    return {
      observation: "",
      implication: "",
      recommendation: "",
    };
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let observation = "";
  let implication = "";
  let recommendation = "";

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("implication:")) {
      implication = cleanText(line.replace(/^implication:\s*/i, ""));
      continue;
    }

    if (
      lower.startsWith("recommend") ||
      lower.startsWith("repair ") ||
      lower.startsWith("replace ") ||
      lower.startsWith("install ") ||
      lower.startsWith("contact ")
    ) {
      recommendation = cleanText([recommendation, line].filter(Boolean).join("\n"));
      continue;
    }

    if (!observation) {
      observation = line;
    } else if (!implication && lower.includes("may ")) {
      implication = cleanText([implication, line].filter(Boolean).join("\n"));
    } else {
      observation = cleanText([observation, line].filter(Boolean).join("\n"));
    }
  }

  if (!recommendation) {
    const split = splitFindingContent(text);
    observation = split.observation;
    implication = split.implication;
    recommendation = split.recommendation;
  }

  return {
    observation: cleanText(observation || text),
    implication: cleanText(implication),
    recommendation: cleanText(recommendation),
  };
}

function parseFindingsFromSpectoraPayload(payload: any): ImportedFinding[] {
  const sections = payload?.report?.sections || payload?.sections || payload?.data?.report?.sections || [];
  const findings: ImportedFinding[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const sectionName = cleanText(section?.name || "Inspection Details");

    for (const item of section?.items || []) {
      const itemName = cleanText(item?.name || "");

      for (const observation of item?.observations || []) {
        const commentType = String(observation?.comment_type || "").toLowerCase();
        const isDefect = commentType === "defect";
        const isRecommendation =
          commentType === "recommendation" || commentType === "safety" || commentType === "maintenance";

        if (!isDefect && !isRecommendation) continue;
        if (String(observation?.value || "").toLowerCase() === "false") continue;

        const title = cleanText(observation?.name || itemName || "Imported Finding");
        const parsedText = parseHtmlFindingText(observation?.text || "");

        const photos = (observation?.photos || [])
          .map((photo: any) => getPhotoUrl(photo))
          .filter(Boolean);

        const key = `${sectionName}:${title}:${parsedText.observation.slice(0, 50)}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          section: sectionName,
          title,
          observation:
            parsedText.observation ||
            "Imported from Spectora report. Review and edit this finding before publishing.",
          implication: parsedText.implication,
          recommendation: parsedText.recommendation || cleanText(observation?.recommendation || ""),
          severity: normalizeSeverityFromSpectora(observation?.category, commentType),
          image_url: photos[0] || "",
          photos,
        });
      }
    }
  }

  return findings;
}

function getReportStorageCandidateUrls(inspectionId: string, reportId: string) {
  const encodedBase = `${inspectionId}%2Freports%2F${reportId}`;

  const firebaseBuckets = [
    "https://firebasestorage.googleapis.com/v0/b/spectora-prod-processed-media/o",
    "https://firebasestorage.googleapis.com/v0/b/spectora-prod-report-data/o",
    "https://firebasestorage.googleapis.com/v0/b/spectora-prod-reports/o",
  ];

  const appUrls = [
    // This is the request Chrome usually shows as: f382c123-...json?alt=media
    `https://app.spectora.com/api/v1/public/reports/${reportId}.json?alt=media`,
    `https://app.spectora.com/api/v1/public/reports/${reportId}/compiled?alt=media`,
    `https://app.spectora.com/api/v1/public/reports/${reportId}/compiled.json?alt=media`,
    `https://reports.spectora.com/reports/${reportId}.json?alt=media`,
    `https://reports.spectora.com/v/reports/${reportId}.json?alt=media`,
  ];

  const firebaseUrls = firebaseBuckets.flatMap((bucket) => [
    // Common compiled report locations used by Spectora's next-gen viewer.
    `${bucket}/${reportId}.json?alt=media`,
    `${bucket}/reports%2F${reportId}.json?alt=media`,
    `${bucket}/inspections%2F${inspectionId}%2Freports%2F${reportId}.json?alt=media`,
    `${bucket}/${encodedBase}.json?alt=media`,
    `${bucket}/${encodedBase}%2F${reportId}.json?alt=media`,
    `${bucket}/${encodedBase}%2Freport.json?alt=media`,
    `${bucket}/${encodedBase}%2Fcompiled.json?alt=media`,
    `${bucket}/${encodedBase}%2Fcompiled%2F${reportId}.json?alt=media`,
  ]);

  const storageUrls = [
    `https://storage.googleapis.com/spectora-prod-processed-media/${reportId}.json`,
    `https://storage.googleapis.com/spectora-prod-processed-media/${inspectionId}/reports/${reportId}.json`,
    `https://storage.googleapis.com/spectora-prod-processed-media/${inspectionId}/reports/${reportId}/${reportId}.json`,
    `https://storage.googleapis.com/spectora-prod-processed-media/${inspectionId}/reports/${reportId}/report.json`,
    `https://storage.googleapis.com/spectora-prod-processed-media/${inspectionId}/reports/${reportId}/compiled.json`,
  ];

  return [...appUrls, ...firebaseUrls, ...storageUrls];
}

function hasSpectoraSections(payload: any) {
  return Boolean(
    payload?.report?.sections?.length ||
      payload?.sections?.length ||
      payload?.data?.report?.sections?.length
  );
}

async function fetchCompiledSpectoraReport(inspectionId: string, reportId: string) {
  if (!inspectionId || !reportId) return null;

  const urls = getReportStorageCandidateUrls(inspectionId, reportId);

  for (const url of urls) {
    const payload = await tryFetchJson(url);

    if (hasSpectoraSections(payload)) {
      console.log("Spectora compiled report found:", url);
      return payload;
    }
  }

  console.warn("Spectora compiled report was not found for", { inspectionId, reportId });
  return null;
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

    const inspectionId = String(reportAttrs.inspection_id || "");
    const pdfUrl = withHttps(reportAttrs.pdf_url || "");
    const coverPhotoUrl = withHttps(reportAttrs.image_url || reportAttrs.cover_photo_url || "");

    let pdfText = "";
    let pdfCoverInfo = {
      propertyAddress: "",
      city: "",
      state: "",
      zip: "",
      clientName: "",
      inspectionDate: "",
    };

    if (pdfUrl) {
      try {
        pdfText = await readPdfTextFromUrl(pdfUrl);
        pdfCoverInfo = extractCoverInfoFromPdfText(pdfText);
      } catch (error) {
        console.warn("Spectora PDF fallback text was not available.");
      }
    }

    const compiledPayload = await fetchCompiledSpectoraReport(inspectionId, reportId);
    const nativeFindings = parseFindingsFromSpectoraPayload(compiledPayload || {});
    const fallbackPdfFindings = nativeFindings.length ? [] : parseFindingsFromPdfText(pdfText);
    const findings = nativeFindings.length ? nativeFindings : fallbackPdfFindings;

    const report = compiledPayload?.report || {};
    const inspection = report?.inspection || {};
    const buyer = inspection?.buyer || report?.buyer || {};
    const buyingAgent = report?.buying_agent || {};
    const addressInfo = splitCityStateZip(inspection?.address || "");

    return NextResponse.json({
      report: {
        reportType: "Spectora Link",
        sourceUrl: spectoraUrl,
        spectoraReportId: reportId,
        spectoraInspectionId: inspectionId,
        pdfUrl,
        coverPhotoUrl: coverPhotoUrl || withHttps(report?.image_url || report?.image || ""),

        propertyAddress:
          inspection?.address1 ||
          pdfCoverInfo.propertyAddress ||
          addressInfo.propertyAddress ||
          "Imported Spectora Report",
        city: inspection?.city || pdfCoverInfo.city || addressInfo.city || "",
        state: inspection?.state || pdfCoverInfo.state || addressInfo.state || "",
        zip: inspection?.zip || pdfCoverInfo.zip || addressInfo.zip || "",
        clientName:
          buyer?.name ||
          inspection?.buyer?.name ||
          pdfCoverInfo.clientName ||
          "",
        clientEmail: buyer?.email || "",
        clientPhone: buyer?.phone || "",
        realtorName: buyingAgent?.name || "",
        realtorEmail: buyingAgent?.email || "",
        realtorPhone: buyingAgent?.phone || "",
        inspectionDate: pdfCoverInfo.inspectionDate || "",

        findings,
        rawTextPreview: pdfText.slice(0, 5000),
        importerStatus: compiledPayload
          ? `Imported ${findings.length} findings from Spectora report data.`
          : `Imported ${findings.length} findings from Spectora PDF fallback.`,
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

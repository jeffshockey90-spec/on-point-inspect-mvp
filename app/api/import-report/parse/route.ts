import { createRequire } from "module";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImportedFinding = {
  section: string;
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
  severity: string;
};

const require = createRequire(import.meta.url);

const KNOWN_SECTIONS = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

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

function cleanText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleCase(value: string) {
  const clean = String(value || "").trim();

  if (!clean) return "";

  return clean
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bGfci\b/g, "GFCI")
    .replace(/\bAfci\b/g, "AFCI")
    .replace(/\bHvac\b/g, "HVAC")
    .replace(/\bOsb\b/g, "OSB");
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function extractPhone(text: string) {
  return (
    text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] ||
    ""
  );
}

function normalizeSeverity(value: string) {
  const clean = String(value || "").toLowerCase();

  if (clean.includes("safety") || clean.includes("hazard") || clean.includes("major")) {
    return "Safety Concern";
  }

  if (clean.includes("maintenance") || clean.includes("monitor")) {
    return "Maintenance";
  }

  if (clean.includes("informational") || clean.includes("information")) {
    return "Informational";
  }

  return "Recommended Repair";
}

function normalizeSection(value: string) {
  const clean = String(value || "")
    .replace(/^\d+:\s*/, "")
    .trim();

  if (!clean) return "Inspection Details";

  const exact = KNOWN_SECTIONS.find(
    (section) => section.toLowerCase() === clean.toLowerCase()
  );

  if (exact) return exact;

  const match = KNOWN_SECTIONS.find((section) =>
    clean.toLowerCase().includes(section.toLowerCase())
  );

  return match || clean || "Inspection Details";
}

function isAllCapsTitle(line: string) {
  const clean = String(line || "").trim();

  if (clean.length < 4) return false;
  if (/^\d+\.\d+\.\d+/.test(clean)) return false;
  if (/^(recommendation|maintenance item|safety hazard|information|deficiencies|general|video)$/i.test(clean)) {
    return false;
  }

  const letters = clean.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;

  return clean === clean.toUpperCase();
}

function extractCoverInfo(text: string) {
  const cleaned = cleanText(text);
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const firstDate = cleaned.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0] || "";

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
  let realtorName = "";
  let realtorPhone = "";
  let realtorEmail = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!propertyAddress && /^\d{2,6}\s+/.test(line) && !/page\s+\d+/i.test(line)) {
      const next = lines[index + 1] || "";
      const cityStateZipMatch = next.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);

      if (cityStateZipMatch) {
        propertyAddress = line;
        city = cityStateZipMatch[1] || "";
        state = cityStateZipMatch[2] || "";
        zip = cityStateZipMatch[3] || "";
        clientName = lines[index + 2] || "";
        break;
      }
    }
  }

  const residentialIndex = lines.findIndex((line) =>
    line.toLowerCase().includes("residential report")
  );

  if (residentialIndex >= 0 && !propertyAddress) {
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

  const agentIndex = lines.findIndex((line) => line.toLowerCase() === "agent");
  if (agentIndex >= 0) {
    realtorName = lines[agentIndex + 1] || "";
    realtorPhone = extractPhone(lines.slice(agentIndex + 2, agentIndex + 5).join(" "));
    realtorEmail = extractEmail(lines.slice(agentIndex + 2, agentIndex + 6).join(" "));
  }

  return {
    propertyAddress,
    city,
    state,
    zip,
    clientName,
    clientEmail: "",
    clientPhone: "",
    realtorName,
    realtorEmail,
    realtorPhone,
    inspectionDate,
  };
}

function isFindingHeader(line: string) {
  return /^\d+\.\d+\.\d+\s+/.test(line.trim());
}

function sectionFromFindingNumber(line: string) {
  const number = line.match(/^(\d+)\./)?.[1] || "";
  return SECTION_NUMBER_MAP[number] || "Inspection Details";
}

function parseSummaryFindingLine(line: string): ImportedFinding | null {
  const clean = line.trim();

  const match = clean.match(/^\d+\.\d+\.\d+\s+(.+?)\s+-\s+(.+?):\s+(.+)$/);
  if (!match) return null;

  return {
    section: normalizeSection(match[1]),
    title: titleCase(match[3]),
    observation: "",
    implication: "",
    recommendation: "",
    severity: "Recommended Repair",
  };
}

function parseSummaryFindings(lines: string[]) {
  const findings: ImportedFinding[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    if (!isFindingHeader(lines[index])) continue;

    let combined = lines[index];

    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 4); cursor += 1) {
      if (isFindingHeader(lines[cursor])) break;
      if (/^\d+:\s+/.test(lines[cursor])) break;
      combined += ` ${lines[cursor]}`;
    }

    const finding = parseSummaryFindingLine(combined);
    if (!finding) continue;

    const key = `${finding.section}:${finding.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push(finding);
  }

  return findings;
}

function parseBodyFindings(lines: string[]) {
  const findings: ImportedFinding[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];

    if (!isFindingHeader(headerLine)) continue;

    const numberMatch = headerLine.match(/^(\d+\.\d+\.\d+)\s+(.+)$/);
    if (!numberMatch) continue;

    const section = sectionFromFindingNumber(headerLine);

    let title = "";
    let severity = "";
    let cursor = index + 1;

    const headerTail = numberMatch[2].trim();

    const summaryFinding = parseSummaryFindingLine(headerLine);
    if (summaryFinding) {
      title = summaryFinding.title;
    }

    if (!title) {
      const possibleTitleParts: string[] = [];

      for (; cursor < Math.min(lines.length, index + 8); cursor += 1) {
        const line = lines[cursor];

        if (isFindingHeader(line)) break;
        if (/^\d+:\s+/.test(line)) break;

        if (isAllCapsTitle(line)) {
          possibleTitleParts.push(line);

          const next = lines[cursor + 1] || "";
          if (isAllCapsTitle(next)) {
            possibleTitleParts.push(next);
            cursor += 1;
          }

          break;
        }
      }

      title = titleCase(possibleTitleParts.join(" ") || headerTail);
    }

    const contentLines: string[] = [];

    for (let contentCursor = cursor + 1; contentCursor < lines.length; contentCursor += 1) {
      const nextLine = lines[contentCursor];

      if (isFindingHeader(nextLine)) break;
      if (/^\d+:\s+/.test(nextLine)) break;
      if (/^Page\s+\d+/i.test(nextLine)) continue;
      if (/^Video$/i.test(nextLine)) continue;
      if (/^\(click here to view on web\)$/i.test(nextLine)) continue;
      if (/^section-[a-z0-9-]+$/i.test(nextLine)) continue;
      if (/^1070\s+Gora|On Point Home Inspections LLC|Scott Shaw/i.test(nextLine)) continue;

      if (
        /^(maintenance item|recommendation|safety hazard|informational|information)$/i.test(
          nextLine
        )
      ) {
        severity = nextLine;
        continue;
      }

      contentLines.push(nextLine);
    }

    const rawContent = cleanText(contentLines.join("\n"));
    const { observation, recommendation } = splitRecommendation(rawContent);

    const key = `${section}:${title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      section,
      title: title || "Imported Finding",
      observation,
      implication: "",
      recommendation,
      severity: normalizeSeverity(severity),
    });
  }

  return findings.filter((finding) => {
    const title = finding.title.toLowerCase();
    if (title.includes("inspection details")) return false;
    if (title.includes("standards of practice")) return false;
    if (title === "information" || title === "deficiencies") return false;
    return finding.title;
  });
}

function mergeFindings(primary: ImportedFinding[], fallback: ImportedFinding[]) {
  const merged: ImportedFinding[] = [];
  const seen = new Set<string>();

  [...primary, ...fallback].forEach((finding) => {
    const key = `${finding.section}:${finding.title}`.toLowerCase();

    if (seen.has(key)) return;
    seen.add(key);

    merged.push(finding);
  });

  return merged;
}

function parseFindings(text: string): ImportedFinding[] {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyFindings = parseBodyFindings(lines);
  const summaryFindings = parseSummaryFindings(lines);

  const findings = bodyFindings.length >= 5
    ? mergeFindings(bodyFindings, summaryFindings)
    : mergeFindings(summaryFindings, bodyFindings);

  return findings.map((finding) => ({
    ...finding,
    observation: finding.observation || "Imported from PDF report. Review and edit this finding before publishing.",
    recommendation: finding.recommendation || "",
    severity: finding.severity || "Recommended Repair",
  }));
}

function readPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const PDFParserModule = require("pdf2json");
      const PDFParser = PDFParserModule.default || PDFParserModule;
      const pdfParser = new PDFParser(null, 1);

      pdfParser.on("pdfParser_dataError", (errorData: any) => {
        reject(
          new Error(
            errorData?.parserError?.message ||
              String(errorData?.parserError || "PDF parser failed.")
          )
        );
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          const pageTexts: string[] = [];

          (pdfData?.Pages || []).forEach((page: any) => {
            const items = (page?.Texts || [])
              .map((item: any) => {
                const decoded = (item?.R || [])
                  .map((run: any) => {
                    try {
                      return decodeURIComponent(run?.T || "");
                    } catch {
                      return String(run?.T || "");
                    }
                  })
                  .join("");

                return {
                  x: Number(item?.x || 0),
                  y: Number(item?.y || 0),
                  text: decoded,
                };
              })
              .filter((item: any) => item.text.trim())
              .sort((a: any, b: any) => {
                if (Math.abs(a.y - b.y) > 0.6) return a.y - b.y;
                return a.x - b.x;
              });

            let currentY: number | null = null;
            let line = "";
            const lines: string[] = [];

            items.forEach((item: any) => {
              if (currentY === null || Math.abs(item.y - currentY) <= 0.6) {
                line += `${line ? " " : ""}${item.text}`;
                currentY = currentY === null ? item.y : currentY;
              } else {
                if (line.trim()) lines.push(line.trim());
                line = item.text;
                currentY = item.y;
              }
            });

            if (line.trim()) lines.push(line.trim());
            pageTexts.push(lines.join("\n"));
          });

          resolve(cleanText(pageTexts.join("\n\n")));
        } catch (error: any) {
          reject(error);
        }
      });

      pdfParser.parseBuffer(buffer);
    } catch (error: any) {
      reject(error);
    }
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Import parser is online. Upload a PDF from /import-report to use this endpoint.",
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
    }

    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files can be imported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await readPdfText(buffer);

    if (!text) {
      return NextResponse.json(
        { error: "Could not read text from this PDF." },
        { status: 400 }
      );
    }

    const coverInfo = extractCoverInfo(text);
    const findings = parseFindings(text);

    const reportType =
      text.toLowerCase().includes("spectora")
        ? "Spectora"
        : text.toLowerCase().includes("residential report")
          ? "PDF Residential Report"
          : "PDF";

    return NextResponse.json({
      report: {
        reportType,
        ...coverInfo,
        findings,
        rawTextPreview: text.slice(0, 5000),
      },
    });
  } catch (error: any) {
    console.error("Import report parse error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Import failed while reading the PDF. Try a different PDF or export the report as a standard PDF.",
      },
      { status: 500 }
    );
  }
}

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

function cleanText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleCase(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
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
  const clean = String(value || "").trim();

  const exact = KNOWN_SECTIONS.find(
    (section) => section.toLowerCase() === clean.toLowerCase()
  );

  if (exact) return exact;

  const match = KNOWN_SECTIONS.find((section) =>
    clean.toLowerCase().includes(section.toLowerCase())
  );

  return match || clean || "Inspection Details";
}

function extractCoverInfo(text: string) {
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
  let realtorName = "";
  let realtorPhone = "";
  let realtorEmail = "";

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

function parseFindingHeader(line: string) {
  const clean = line.trim();

  const summaryMatch = clean.match(/^\d+\.\d+\.\d+\s+(.+?)\s+-\s+(.+?):\s+(.+)$/);
  if (summaryMatch) {
    return {
      section: normalizeSection(summaryMatch[1]),
      subsystem: summaryMatch[2],
      title: titleCase(summaryMatch[3]),
    };
  }

  const bodyMatch = clean.match(/^\d+\.\d+\.\d+\s+(.+)$/);
  if (bodyMatch) {
    return {
      section: "",
      subsystem: "",
      title: titleCase(bodyMatch[1]),
    };
  }

  return null;
}

function detectSectionFromNearby(lines: string[], index: number) {
  for (let cursor = index; cursor >= Math.max(0, index - 60); cursor -= 1) {
    const line = lines[cursor]?.trim() || "";
    const sectionMatch = line.match(/^\d+:\s+(.+)$/);

    if (sectionMatch) {
      return normalizeSection(sectionMatch[1]);
    }

    const known = KNOWN_SECTIONS.find(
      (section) => line.toLowerCase() === section.toLowerCase()
    );

    if (known) return known;
  }

  return "Inspection Details";
}

function splitRecommendation(text: string) {
  const clean = cleanText(text);

  const recommendationMarkers = [
    "Recommend ",
    "Recommendation:",
    "Recommendation",
    "Have ",
    "Replace ",
    "Repair ",
    "Monitor ",
  ];

  for (const marker of recommendationMarkers) {
    const index = clean.indexOf(marker);

    if (index > 80) {
      return {
        observation: clean.slice(0, index).trim(),
        recommendation: clean.slice(index).trim(),
      };
    }
  }

  return {
    observation: clean,
    recommendation: "",
  };
}

function parseFindings(text: string): ImportedFinding[] {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const findings: ImportedFinding[] = [];
  const seenTitles = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!isFindingHeader(line)) continue;

    const header = parseFindingHeader(line);
    if (!header) continue;

    const section = header.section || detectSectionFromNearby(lines, index);
    const contentLines: string[] = [];
    let severity = "";

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];

      if (isFindingHeader(nextLine)) break;
      if (/^\d+:\s+/.test(nextLine)) break;
      if (/^Page\s+\d+/i.test(nextLine)) continue;
      if (/^Video$/i.test(nextLine)) continue;
      if (/^\(click here to view on web\)$/i.test(nextLine)) continue;
      if (/^section-[a-z0-9-]+$/i.test(nextLine)) continue;

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
    if (!rawContent && seenTitles.has(header.title.toLowerCase())) continue;

    const { observation, recommendation } = splitRecommendation(rawContent);

    const findingKey = `${section}:${header.title}`.toLowerCase();
    if (seenTitles.has(findingKey)) continue;
    seenTitles.add(findingKey);

    findings.push({
      section,
      title: header.title || "Imported Finding",
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
    return finding.title && (finding.observation || finding.recommendation);
  });
}

async function readPdfText(buffer: Buffer) {
  const pdfParseModule = await import("pdf-parse");
  const pdfParse =
    (pdfParseModule as any).default ||
    (pdfParseModule as any).pdf ||
    (pdfParseModule as any).parse ||
    pdfParseModule;

  if (typeof pdfParse !== "function") {
    throw new Error("PDF parser is not available. Run: npm install pdf-parse@1.1.1");
  }

  const result = await pdfParse(buffer);
  return cleanText(result?.text || "");
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
        rawTextPreview: text.slice(0, 2000),
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

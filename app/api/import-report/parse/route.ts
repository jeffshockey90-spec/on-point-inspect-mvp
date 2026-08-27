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

// --- ligature repair. pdf-parse drops fi/fl/ffi/ff/ft glyphs; sometimes it
// leaves a space where the glyph was ("de ciency"), sometimes nothing
// ("qualied"). Fix both forms for common inspection vocabulary. ---
const LIGATURE_FIXES: [RegExp, string][] = [
  [/ ciency\b/gi, "ficiency"], [/ ciencies\b/gi, "ficiencies"], [/ cient\b/gi, "ficient"],
  [/ nishes\b/g, " finishes"], [/ nished\b/g, " finished"], [/ nish\b/g, " finish"],
  [/ ashing\b/gi, " flashing"], [/ ow\b/g, " flow"], [/ oor\b/g, " floor"],
  [/ tment\b/g, " fitment"], [/ tting\b/g, " fitting"], [/ ttings\b/g, " fittings"],
  [/ replace\b/gi, " fireplace"], [/ eld\b/g, " field"],
  [/\bcerti ?ed\b/gi, "certified"], [/\bquali ?ed\b/gi, "qualified"], [/\bquali ?cation\b/gi, "qualification"],
  [/\bveri ?ed\b/gi, "verified"], [/\bveri ?cation\b/gi, "verification"],
  [/\bidenti ?ed\b/gi, "identified"], [/\bnoti ?ed\b/gi, "notified"],
  [/\bspeci ?ed\b/gi, "specified"], [/\bspeci ?c\b/gi, "specific"], [/\bspeci ?cations?\b/gi, "specifications"],
  [/\bde ?ciency\b/gi, "deficiency"], [/\bde ?ciencies\b/gi, "deficiencies"], [/\bde ?cient\b/gi, "deficient"],
  [/\bef ?ciency\b/gi, "efficiency"], [/\bef ?cient\b/gi, "efficient"], [/\bsuf ?cient\b/gi, "sufficient"],
  [/\bin ?ltration\b/gi, "infiltration"], [/\bclassi ?cation\b/gi, "classification"],
  [/\bSo ?ts\b/g, "Soffits"], [/\bSo ?t\b/g, "Soffit"], [/\bso ?ts\b/g, "soffits"], [/\bso ?t\b/g, "soffit"],
  [/\bRoo ?ng\b/g, "Roofing"], [/\broo ?ng\b/g, "roofing"],
  [/\bha separated\b/g, "has separated"],
];

function fixLigatures(value: string) {
  let out = value;
  for (const [re, rep] of LIGATURE_FIXES) out = out.replace(re, rep);
  return out.replace(/  +/g, " ");
}

function cleanText(value: string) {
  return fixLigatures(
    String(value || "")
      .replace(/\r/g, "\n")
      .replace(/\x00/g, "")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
    .replace(/\bOsb\b/g, "OSB")
    .replace(/\bPvc\b/g, "PVC")
    .replace(/\bCo\b/g, "CO")
    .replace(/\bAo\b/g, "AO");
}

// Map an inspector's section name onto FLOW's standard names where they match;
// otherwise keep it as a custom section (FLOW supports custom sections).
const SECTION_ALIASES: Record<string, string> = {
  appliances: "Built-in Appliances",
  "built-in appliances": "Built-in Appliances",
  "built in appliances": "Built-in Appliances",
  structure: "Basement, Foundation, Crawlspace & Structure",
};
function canonSection(name: string) {
  const n = String(name || "").trim().replace(/\s+/g, " ");
  return SECTION_ALIASES[n.toLowerCase()] || n;
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function extractPhone(text: string) {
  return text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
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

// Build number -> section name from the TABLE OF CONTENTS ("3: Exterior").
// Keep the FIRST match per number (the TOC's title-case name) so the later
// uppercase in-body section headers don't overwrite it.
function buildSectionMap(lines: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^(\d+):\s+(.+)$/);
    if (m && !map[m[1]]) {
      const name = m[2].trim();
      if (name.length <= 45 && !/page \d+/i.test(name)) map[m[1]] = canonSection(name);
    }
  }
  return map;
}

function isUpperTitle(line: string) {
  const l = String(line || "").trim();
  if (l.length < 3) return false;
  const letters = l.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && l === l.toUpperCase();
}

// A summary line embeds the section + subsystem + title:
//   "3.2.1 Exterior - Siding, Flashing & Trim: Siding Damage"
const SUMMARY_LINE = /^(\d+)\.(\d+)\.(\d+)\s+(.+?)\s-\s(.+?):\s+(.+)$/;
// A body finding header is just number + subsystem: "3.2.1 Siding, Flashing & Trim"
const FINDING_HDR = /^(\d+)\.(\d+)\.(\d+)\s+(.+)$/;
const SECTION_HDR = /^\d+:\s+/;
const GRID_ROW = /^\d+\.\d+[A-Za-z]/; // section rating grid rows like "3.2Siding...X"
const FOOTER =
  /Above and Beyond|Page \d+ of \d+|^section-[A-Za-z0-9]|^IN = Inspected|^INNINPD|1236 Rosita/i;

function parseFindings(text: string, sectionMap: Record<string, string>): ImportedFinding[] {
  const lines = text.split("\n").map((line) => line.trim());

  // Pass 1 - summary lines: authoritative section + clean title, in order.
  const summary: Record<string, { section: string; title: string }> = {};
  const order: string[] = [];
  for (const line of lines) {
    const m = line.match(SUMMARY_LINE);
    if (!m) continue;
    const num = `${m[1]}.${m[2]}.${m[3]}`;
    if (summary[num]) continue;
    summary[num] = {
      section: canonSection(sectionMap[m[1]] || m[4].trim()),
      title: titleCase(m[6].trim()),
    };
    order.push(num);
  }

  // Pass 2 - body headers: the narrative (observation + recommendation).
  const body: Record<
    string,
    { title: string; observation: string; recommendation: string; location: string }
  > = {};
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (SUMMARY_LINE.test(line)) continue; // skip the summary block
    const m = line.match(FINDING_HDR);
    if (!m) continue;
    const num = `${m[1]}.${m[2]}.${m[3]}`;

    let j = i + 1;
    while (j < lines.length && (!lines[j] || FOOTER.test(lines[j]))) j += 1;
    const titleRaw = lines[j] || "";
    const bodyTitle = isUpperTitle(titleRaw) ? titleCase(titleRaw) : "";
    if (bodyTitle) j += 1;

    let location = "";
    if (j < lines.length && isUpperTitle(lines[j]) && lines[j].length < 60) {
      location = titleCase(lines[j]);
      j += 1;
    }

    const narrative: string[] = [];
    let recommendation = "";
    let inRec = false;
    for (; j < lines.length; j += 1) {
      const ln = lines[j];
      if (FINDING_HDR.test(ln) || SECTION_HDR.test(ln) || GRID_ROW.test(ln)) break;
      if (!ln || FOOTER.test(ln)) continue;
      if (/^Recommendation$/i.test(ln)) {
        inRec = true;
        continue;
      }
      if (/^(Information|Limitations|Observations|General)$/i.test(ln)) continue;
      if (inRec) recommendation += (recommendation ? " " : "") + ln;
      else narrative.push(ln);
    }

    let observation = narrative.join(" ").trim();
    if (!recommendation) {
      const idx = observation.search(/\bRecommend\b/);
      if (idx > 40) {
        recommendation = observation.slice(idx).trim();
        observation = observation.slice(0, idx).trim();
      }
    }

    body[num] = { title: bodyTitle, observation, recommendation, location };
  }

  const nums = order.length ? [...order] : Object.keys(body);
  for (const num of Object.keys(body)) if (!nums.includes(num)) nums.push(num);

  const findings: ImportedFinding[] = nums.map((num) => {
    const s = summary[num] || ({} as { section?: string; title?: string });
    const b =
      body[num] ||
      ({} as { title?: string; observation?: string; recommendation?: string; location?: string });
    const section = s.section || sectionMap[num.split(".")[0]] || "Inspection Details";
    const title = s.title || b.title || "Imported Finding";
    let observation = b.observation || "";
    if (b.location) {
      observation = observation ? `Location: ${b.location}. ${observation}` : `Location: ${b.location}.`;
    }
    if (!observation) {
      observation = "Imported from the Spectora report - review this finding before publishing.";
    }
    return {
      section,
      title,
      observation,
      implication: "",
      recommendation: b.recommendation || "",
      severity: normalizeSeverity(`${title} ${observation} ${b.recommendation || ""}`),
    };
  });

  // Drop non-finding rows that occasionally sneak in.
  return findings.filter((f) => {
    const t = f.title.toLowerCase();
    if (!t || t === "information" || t === "deficiencies" || t === "limitations") return false;
    if (t.includes("standards of practice")) return false;
    return true;
  });
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

async function readPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
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
      return NextResponse.json({ error: "Could not read text from this PDF." }, { status: 400 });
    }

    const lines = text.split("\n").map((line) => line.trim());
    const sectionMap = buildSectionMap(lines);

    const coverInfo = extractCoverInfo(text);
    const findings = parseFindings(text, sectionMap);

    const reportType = text.toLowerCase().includes("spectora")
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

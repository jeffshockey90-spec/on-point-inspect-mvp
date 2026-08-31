import { createRequire } from "module";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ImportedFinding = {
  section: string;
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
  severity: string;
  page?: number;
  photos?: string[];
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

  // Page of each line, from the "Page N of M" footers. A finding sits on the
  // page whose footer comes next after it, so scan backward carrying the page.
  const pageOfLine = new Array(lines.length).fill(0);
  let nextPage = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const pm = lines[i].match(/Page (\d+) of \d+/);
    if (pm) nextPage = parseInt(pm[1], 10);
    pageOfLine[i] = nextPage;
  }

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
    { title: string; observation: string; recommendation: string; location: string; page: number }
  > = {};
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (SUMMARY_LINE.test(line)) continue; // skip the summary block
    const m = line.match(FINDING_HDR);
    if (!m) continue;
    const num = `${m[1]}.${m[2]}.${m[3]}`;
    const page = pageOfLine[i] || 0;

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

    body[num] = { title: bodyTitle, observation, recommendation, location, page };
  }

  const nums = order.length ? [...order] : Object.keys(body);
  for (const num of Object.keys(body)) if (!nums.includes(num)) nums.push(num);

  const findings: ImportedFinding[] = nums.map((num) => {
    const s = summary[num] || ({} as { section?: string; title?: string });
    const b =
      body[num] ||
      ({} as { title?: string; observation?: string; recommendation?: string; location?: string; page?: number });
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
      page: b.page || 0,
      photos: [] as string[],
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

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Pull the embedded JPEG photos out of the PDF (skipping tiny icons), normalize
// them with sharp, upload to the public company-assets bucket, and return each
// photo's URL plus the PDF page it appeared on (for mapping to findings).
async function extractAndUploadPhotos(
  buffer: Buffer
): Promise<{ photos: { page: number; url: string }[]; coverUrl: string }> {
  const empty = { photos: [] as { page: number; url: string }[], coverUrl: "" };
  const admin = supabaseAdmin();
  if (!admin) return empty;

  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    return empty;
  }
  const ctx = pdf.context;

  // Map each image XObject ref -> the (1-based) page it first appears on.
  const refToPage = new Map<string, number>();
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i += 1) {
    const res = pages[i].node.Resources();
    if (!res) continue;
    let xobj: any = res.get(PDFName.of("XObject"));
    if (xobj && !xobj.entries) {
      try {
        xobj = ctx.lookup(xobj);
      } catch {
        xobj = null;
      }
    }
    if (!xobj || !xobj.entries) continue;
    for (const [, value] of xobj.entries()) {
      const key = value?.toString?.();
      if (key && !refToPage.has(key)) refToPage.set(key, i + 1);
    }
  }

  const sessionId = randomUUID();
  const out: { page: number; url: string }[] = [];
  let idx = 0;
  // The property cover photo is the largest image on the first couple of pages.
  let coverUrl = "";
  let coverArea = 0;

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if ((dict.get(PDFName.of("Subtype")) as any)?.encodedName !== "/Image") continue;
    if ((dict.get(PDFName.of("Filter")) as any)?.encodedName !== "/DCTDecode") continue;
    const w = (dict.get(PDFName.of("Width")) as any)?.numberValue || 0;
    const h = (dict.get(PDFName.of("Height")) as any)?.numberValue || 0;
    if (w < 250 || h < 250) continue; // skip icons / logos

    const page = refToPage.get(ref.toString()) || 0;
    let jpeg: any = Buffer.from(obj.contents);
    try {
      jpeg = await sharp(jpeg)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      // fall back to the raw JPEG bytes
    }

    const path = `import/${sessionId}/${idx}.jpg`;
    idx += 1;
    const { error } = await admin.storage
      .from("company-assets")
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (error) continue;
    const { data } = admin.storage.from("company-assets").getPublicUrl(path);
    if (data?.publicUrl) {
      out.push({ page, url: data.publicUrl });
      // The property cover photo is the largest image near the START of the PDF
      // (cover page), regardless of the page it maps to -- Spectora often nests
      // the cover image so page detection returns 0.
      const area = w * h;
      if (idx <= 8 && area > coverArea) {
        coverArea = area;
        coverUrl = data.publicUrl;
      }
    }
  }

  return { photos: out, coverUrl };
}

// Attach each photo to a finding: prefer a finding on the photo's exact page
// (round-robin when a page has several), otherwise the nearest earlier finding.
function attachPhotosToFindings(
  findings: ImportedFinding[],
  photos: { page: number; url: string }[],
  minPhotoPage = 5
) {
  const byPage = new Map<number, ImportedFinding[]>();
  findings.forEach((f) => {
    f.photos = [];
    const p = f.page || 0;
    if (p > 0) {
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p)!.push(f);
    }
  });
  const cursor = new Map<number, number>();

  for (const ph of photos) {
    // Early pages are cover / table of contents / summary chrome -- their images
    // are the house cover or report branding, not defect photos. The floor is
    // format-aware: Spectora/Hive findings start deeper in the PDF, Horizon's
    // begin on page 2.
    if (ph.page < minPhotoPage) continue;
    // Attach to a finding on the same page; if none, widen the search out to
    // +/-2 pages (round-robin when a page has several findings). Only drop a
    // photo if there is no finding within that window (section-info images).
    let list: ImportedFinding[] | null = null;
    for (const d of [0, 1, -1, 2, -2]) {
      const cand = byPage.get(ph.page + d);
      if (cand && cand.length) {
        list = cand;
        break;
      }
    }
    if (!list) continue;
    const c = cursor.get(ph.page) || 0;
    list[c % list.length].photos!.push(ph.url);
    cursor.set(ph.page, c + 1);
  }
}

// ============================================================================
// Multi-source support: Carson Dunlop HORIZON and HIVE PDFs (in addition to the
// Spectora/residential format handled above). Detection keys off text markers;
// each has its own findings parser + cover extractor. Section names that don't
// map cleanly to a FLOW standard section are KEPT as-is (custom sections).
// ============================================================================

type ReportFormat = "horizon" | "hive" | "spectora";

function detectReportFormat(text: string): ReportFormat {
  const t = text.toLowerCase();
  if (/carsondunlop|setting the standard for home inspection since 1978|horizon professional/.test(t)) {
    return "horizon";
  }
  // Hive's per-section inspection grid header ("SUBSECTION IN NI NP D # OBSERVATIONS")
  // collapses to this distinctive token; its tier labels are also unique.
  if (/subsectioninninpd|maintenance & cosmetic observations|functional or performance observations/.test(t)) {
    return "hive";
  }
  return "spectora";
}

// Preserve an inspector-defined section name unless it's unambiguously one of
// FLOW's standard sections (then use FLOW's canonical spelling).
const FLOW_STANDARD_SECTIONS = [
  "Inspection Details", "Exterior", "Roof", "Basement, Foundation, Crawlspace & Structure",
  "Heating", "Cooling", "Plumbing", "Electrical", "Fireplace",
  "Attic, Insulation & Ventilation", "Doors, Windows & Interior", "Built-in Appliances", "Garage", "Disclaimers",
];
const normSectionKey = (s: string) =>
  String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const STD_SECTION_BY_KEY: Record<string, string> = {};
for (const s of FLOW_STANDARD_SECTIONS) STD_SECTION_BY_KEY[normSectionKey(s)] = s;
function canonicalOrCustomSection(name: string): string {
  const k = normSectionKey(name);
  if (STD_SECTION_BY_KEY[k]) return STD_SECTION_BY_KEY[k];
  if (k === "attic" || k === "insulation" || k === "attic insulation and ventilation") {
    return "Attic, Insulation & Ventilation";
  }
  return titleCase(String(name || "").trim());
}

// ---- Carson Dunlop Horizon ----
const HZ_SECTIONS: Record<string, string> = {
  ROOFING: "Roof", EXTERIOR: "Exterior", STRUCTURE: "Basement, Foundation, Crawlspace & Structure",
  ELECTRICAL: "Electrical", HEATING: "Heating", COOLING: "Cooling",
  INSULATION: "Attic, Insulation & Ventilation", PLUMBING: "Plumbing", INTERIOR: "Doors, Windows & Interior",
  FIREPLACE: "Fireplace", GARAGE: "Garage", APPLIANCES: "Built-in Appliances",
};
const HZ_PAGEBREAK =
  /carsondunlop|Setting the standard for home inspection|^Report No\.|Page \d+ of \d+|^REFERENCE$|^[A-Z][A-Z ]{14,}$|(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\s*$/;

function horizonSeverity(impl: string, task: string, time: string) {
  const s = `${impl} ${task}`.toLowerCase();
  const ti = (time || "").toLowerCase();
  if (/shock|fire|hazard|carbon monoxide|safety|\bfall\b|burn|gas leak|trip hazard|structural failure|collapse/.test(s)) {
    return "Safety Concern";
  }
  if (ti.includes("immediate")) return "Major Concern";
  if (/less than 1 year|less than one year/.test(ti)) return "Recommended Repair";
  if ((task || "").toLowerCase().includes("monitor") || ti.includes("discretionary") || ti.includes("ongoing") || /\byears?\b/.test(ti)) {
    return "Maintenance";
  }
  return "Recommended Repair";
}

function pageMap(lines: string[]): number[] {
  const pageOfLine = new Array(lines.length).fill(0);
  let nextPage = 0;
  for (let k = lines.length - 1; k >= 0; k -= 1) {
    const pm = lines[k].match(/Page (\d+) of \d+/);
    if (pm) nextPage = parseInt(pm[1], 10);
    pageOfLine[k] = nextPage;
  }
  return pageOfLine;
}

function parseHorizonFindings(text: string): ImportedFinding[] {
  const lines = text.split("\n").map((l) => l.trim());
  const pageOfLine = pageMap(lines);
  const out: ImportedFinding[] = [];
  let section = "Inspection Details";
  let component = "", subcomponent = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (HZ_SECTIONS[line]) { section = HZ_SECTIONS[line]; i += 1; continue; }
    const comp = line.match(/^([A-Z][A-Z0-9 ,&\/'\-]{2,})\s\\\s(.+)$/);
    if (comp) { component = comp[1].trim(); subcomponent = comp[2].trim(); i += 1; continue; }
    const fm = line.match(/^(\d+)\.Condition:\s*(.*)$/);
    if (!fm) { i += 1; continue; }
    const condition = fm[2].trim();
    const startIdx = i;
    const findingComponent = component;
    const narrative: string[] = [];
    let implication = "", location = "", task = "", time = "", cost = "";
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const ln = lines[j];
      if (/^\d+\.Condition:/.test(ln)) break;
      if (HZ_SECTIONS[ln]) break;
      if (/^([A-Z][A-Z0-9 ,&\/'\-]{2,})\s\\\s/.test(ln)) break;
      if (/^(Descriptions|Inspection Methods & Limitations|General:)/i.test(ln)) break;
      if (HZ_PAGEBREAK.test(ln)) break;
      if (!ln) continue;
      let m: RegExpMatchArray | null;
      if ((m = ln.match(/^Implication\(s\):\s*(.+)$/i))) { implication = m[1].replace(/\s*\|\s*/g, "; ").trim(); continue; }
      if ((m = ln.match(/^Location:\s*(.+)$/i))) { location = m[1].trim(); continue; }
      if ((m = ln.match(/^Task:\s*(.+)$/i))) { task = m[1].trim(); continue; }
      if ((m = ln.match(/^Time:\s*(.+)$/i))) { time = m[1].trim(); continue; }
      if ((m = ln.match(/^Cost:\s*(.+)$/i))) { cost = m[1].trim(); continue; }
      narrative.push(ln);
    }
    i = j;
    if (/^COMMENTS?$/i.test(findingComponent) && !task && !location) continue;
    if (!task && !location && condition.length > 140) continue;
    const extra = narrative.filter((n) => n.toLowerCase() !== condition.toLowerCase());
    let observation = extra.join(" ").trim();
    if (location) observation = observation ? `${observation} (Location: ${location})` : `Location: ${location}.`;
    if (!observation) observation = condition;
    const title = titleCase(condition.length > 80 ? subcomponent || condition.slice(0, 60) : condition);
    let recommendation = "";
    if (task || time) {
      recommendation = `Suggested action: ${task || "Review"}${time ? `. Time frame: ${time}` : ""}${cost ? `. Estimated cost: ${cost}` : ""}.`;
    }
    out.push({
      section, title: title || "Imported Finding",
      observation: cleanText(observation), implication: cleanText(implication),
      recommendation: cleanText(recommendation), severity: horizonSeverity(implication, task, time),
      page: pageOfLine[startIdx] || 0, photos: [],
    });
  }
  return out;
}

function extractHorizonCover(text: string) {
  const cover = {
    propertyAddress: "", city: "", state: "", zip: "", clientName: "",
    clientEmail: "", clientPhone: "", realtorName: "", realtorEmail: "", realtorPhone: "", inspectionDate: "",
  };
  // The repeated footer stamp: "443 Madison St, Chicago, IL     March 1, 2018"
  const stamp = text.match(
    /^(.+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/m,
  );
  if (stamp) {
    cover.propertyAddress = stamp[1].trim();
    cover.city = stamp[2].trim();
    cover.state = stamp[3].trim();
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const mo = months.indexOf(stamp[4].toLowerCase()) + 1;
    cover.inspectionDate = `${stamp[6]}-${String(mo).padStart(2, "0")}-${stamp[5].padStart(2, "0")}`;
  }
  const dear = text.match(/Dear\s+([^,\n]+),/);
  if (dear) cover.clientName = dear[1].trim();
  cover.clientEmail = extractEmail(text);
  return cover;
}

// ---- Hive ----
const HIVE_TIERS: Record<string, string> = {
  "material safety or functional concerns": "Safety Concern",
  "functional or performance observations": "Recommended Repair",
  "maintenance & cosmetic observations": "Maintenance",
};

function parseHiveFindings(text: string): ImportedFinding[] {
  const lines = text.split("\n").map((l) => l.trim());
  const pageOfLine = pageMap(lines);
  // Header/footer chrome (property + client + company) repeats every page.
  const freq: Record<string, number> = {};
  for (const l of lines) if (l && l.length < 90) freq[l] = (freq[l] || 0) + 1;
  const repeated = new Set(
    Object.keys(freq).filter((l) => freq[l] >= 4 && !/^(OBSERVATIONS|INFORMATION|LIMITATIONS)$/i.test(l)),
  );
  const out: ImportedFinding[] = [];
  let section = "Inspection Details";
  let inObs = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const sec = line.match(/^(\d+)\.0\s+(.+)$/);
    if (sec) { section = canonicalOrCustomSection(sec[2]); inObs = false; i += 1; continue; }
    if (/^OBSERVATIONS$/i.test(line)) { inObs = true; i += 1; continue; }
    if (/^(INFORMATION|LIMITATIONS|Rating Legend:|SUBSECTION)/i.test(line)) { inObs = false; i += 1; continue; }
    if (!inObs) { i += 1; continue; }
    const fm = line.match(/^(\d+)\.(\d+)\s+(.+)$/);
    if (!fm) { i += 1; continue; }
    const startIdx = i;
    const title = (lines[i + 1] || "").trim();
    const severity = HIVE_TIERS[(lines[i + 2] || "").trim().toLowerCase()];
    if (!severity) { i += 1; continue; }
    let j = i + 3;
    let location = "", service = "";
    const narr: string[] = [];
    for (; j < lines.length; j += 1) {
      const ln = lines[j];
      if (/^\d+\.\d+\s+/.test(ln)) break;
      if (/^\d+\.0\s+/.test(ln)) break;
      if (/^(OBSERVATIONS|INFORMATION|LIMITATIONS|SUBSECTION|Rating Legend:)/i.test(ln)) break;
      if (!ln) continue;
      if (/^Page \d+ of \d+/i.test(ln)) continue;
      if (repeated.has(ln)) continue;
      let m: RegExpMatchArray | null;
      if ((m = ln.match(/^Location:\s*(.+)$/i))) { location = m[1].trim(); continue; }
      if ((m = ln.match(/^Service:\s*(.+)$/i))) { service = m[1].trim(); continue; }
      narr.push(ln);
    }
    i = j;
    let observation = narr.join(" ").trim();
    if (location) observation = observation ? `${observation} (Location: ${location})` : `Location: ${location}.`;
    out.push({
      section, title: title || "Imported Finding",
      observation: cleanText(observation || title), implication: "",
      recommendation: service ? `Recommended service: ${service}.` : "", severity,
      page: pageOfLine[startIdx] || 0, photos: [],
    });
  }
  return out;
}

function extractHiveCover(text: string) {
  const cover = {
    propertyAddress: "", city: "", state: "", zip: "", clientName: "",
    clientEmail: "", clientPhone: "", realtorName: "", realtorEmail: "", realtorPhone: "", inspectionDate: "",
  };
  const lines = text.split("\n").map((l) => l.trim());
  const idx = lines.findIndex((l) => /^HOME INSPECTION REPORT$/i.test(l));
  if (idx >= 0) {
    const addr = lines[idx + 1] || "";
    const am = addr.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (am) { cover.propertyAddress = am[1].trim(); cover.city = am[2].trim(); cover.state = am[3].trim(); cover.zip = am[4] || ""; }
    cover.clientName = lines[idx + 2] || "";
  }
  const d = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (d) cover.inspectionDate = `${d[3]}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
  // Buyer's/Listing agent block -> realtor.
  const agentIdx = lines.findIndex((l) => /^(Buyer's Agent|Buyers Agent|Listing Agent|Agent)$/i.test(l));
  if (agentIdx >= 0) {
    cover.realtorName = lines[agentIdx + 1] || "";
    cover.realtorPhone = extractPhone(lines.slice(agentIdx + 1, agentIdx + 5).join(" "));
    cover.realtorEmail = extractEmail(lines.slice(agentIdx + 1, agentIdx + 6).join(" "));
  }
  return cover;
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

    const format = detectReportFormat(text);

    let coverInfo: ReturnType<typeof extractCoverInfo>;
    let findings: ImportedFinding[];

    if (format === "horizon") {
      coverInfo = extractHorizonCover(text);
      findings = parseHorizonFindings(text);
    } else if (format === "hive") {
      coverInfo = extractHiveCover(text);
      findings = parseHiveFindings(text);
    } else {
      const lines = text.split("\n").map((line) => line.trim());
      const sectionMap = buildSectionMap(lines);
      coverInfo = extractCoverInfo(text);
      findings = parseFindings(text, sectionMap);
    }

    // Extract the embedded photos: attach defect photos to their findings, and
    // use the largest cover-page image as the property photo. Both carry into
    // the FLOW report (and its downloadable PDF).
    let coverPhotoUrl = "";
    try {
      const extracted = await extractAndUploadPhotos(buffer);
      const minPhotoPage = format === "horizon" ? 2 : 5;
      if (extracted.photos.length) attachPhotosToFindings(findings, extracted.photos, minPhotoPage);
      coverPhotoUrl = extracted.coverUrl;
    } catch (photoError) {
      console.error("Import photo extraction failed:", photoError);
    }

    const reportType =
      format === "horizon"
        ? "Carson Dunlop Horizon"
        : format === "hive"
          ? "Hive"
          : text.toLowerCase().includes("spectora")
            ? "Spectora"
            : text.toLowerCase().includes("residential report")
              ? "PDF Residential Report"
              : "PDF";

    return NextResponse.json({
      report: {
        reportType,
        ...coverInfo,
        coverPhotoUrl,
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

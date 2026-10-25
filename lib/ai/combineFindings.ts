import OpenAI from "openai";
import { buildWritingStyleInstructions } from "./writingStyle";

// Shared core for merging several findings (same defect at different locations)
// into ONE clean, well-structured finding. Used by both the Combine route and
// the Uncombine "remove a location" re-merge so the wording stays consistent and
// there is a single prompt to maintain.

// Same 6-level severity set the app uses everywhere; index = seriousness.
export const SEVERITY_ORDER = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

export function cleanStr(v: any) {
  return String(v ?? "").trim();
}

export function severityRank(value: any) {
  const idx = SEVERITY_ORDER.indexOf(cleanStr(value));
  return idx < 0 ? 3 : idx; // default to "Recommended Repair"
}

export type MergeSourceRow = {
  section?: any;
  location?: any;
  severity?: any;
  title?: any;
  observation?: any;
  implication?: any;
  recommendation?: any;
};

export type MergeResult = {
  title: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  mergedSeverity: string;
};

// Produce the combined write-up for the given source findings. `writingConfig`
// is the company's AI Writing Studio config (already loaded by the caller).
export async function mergeFindingsNarrative(
  openai: OpenAI,
  rows: MergeSourceRow[],
  writingConfig: any,
  fallback?: Partial<MergeResult>,
): Promise<MergeResult> {
  const mergedSeverity =
    SEVERITY_ORDER[Math.max(...rows.map((r) => severityRank(r.severity)))] ||
    cleanStr(fallback?.severity) ||
    "Recommended Repair";

  // Lazy import so this module's pure helpers (severityRank, etc.) stay
  // importable without instantiating the OpenAI client at module load.
  const { getAIModel } = await import("../openai");

  const styleBlock = buildWritingStyleInstructions(writingConfig);

  // The clarity rules below keep a multi-location combine from reading as a
  // cluttered pile of repeated sentences — one clean observation that is
  // organized by location, one shared implication, one shared recommendation.
  const systemPrompt = `You merge several home inspection findings that describe the SAME kind of defect found at DIFFERENT locations into ONE clean, combined finding.

WHAT TO PRODUCE — keep it clear and uncluttered, especially with many locations:
- TITLE: accurately names the defect and signals multiple locations when relevant (e.g. "Damaged Weather-Stripping at Multiple Exterior Doors"). Do not just reuse one input's title.
- OBSERVATION: ONE short lead sentence describing the shared defect, then the specifics organized BY LOCATION so each affected area is clearly called out and easy to scan. Do NOT repeat the same sentence for every location — state what is common once, then note only what differs per location. No duplicated boilerplate.
- IMPLICATION: ONE combined explanation of why it matters across the locations. Do not repeat it per location.
- RECOMMENDATION: ONE clear, consolidated recommendation covering all affected locations.

RULES:
- Keep every fact. Do not invent, exaggerate, or drop any defect or location.
- Every affected location/area MUST be named.
- Use the most serious severity among the inputs (${mergedSeverity}).
- Professional, accurate, liability-safe. Concise over repetitive.

${styleBlock}

Return ONLY valid JSON: {"title":"","observation":"","implication":"","recommendation":""}`;

  const userPrompt = `Merge these ${rows.length} findings into ONE clean finding that covers all locations:

${rows
    .map((f, i) => {
      const loc = cleanStr(f.location);
      return `Finding ${i + 1} — Section: ${cleanStr(f.section) || "?"}${
        loc ? `, Location: ${loc}` : ""
      }, Severity: ${cleanStr(f.severity) || "?"}
Title: ${cleanStr(f.title)}
Observation: ${cleanStr(f.observation)}
Implication: ${cleanStr(f.implication)}
Recommendation: ${cleanStr(f.recommendation)}`;
    })
    .join("\n\n")}`;

  const aiResponse = await openai.chat.completions.create({
    model: getAIModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(aiResponse.choices[0]?.message?.content || "{}");
  } catch {
    parsed = {};
  }

  return {
    title: cleanStr(parsed.title) || cleanStr(fallback?.title) || "Combined finding",
    severity: mergedSeverity,
    observation: cleanStr(parsed.observation) || cleanStr(fallback?.observation),
    implication: cleanStr(parsed.implication) || cleanStr(fallback?.implication),
    recommendation: cleanStr(parsed.recommendation) || cleanStr(fallback?.recommendation),
    mergedSeverity,
  };
}

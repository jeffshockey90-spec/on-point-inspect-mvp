// AI-based defect-type tagging for "Common Ground".
//
// The alias/keyword classifier in dealCatalog.ts (classifyDefect) only matches
// when a finding's text literally contains a catalog phrase, so most real
// findings fall through to "_unmatched" and never get a Common Ground panel.
// This classifier asks the AI to semantically map each finding to the single
// best catalog defect type (or "none"), which covers far more findings.
//
// Server-only (uses the OpenAI key). Returns catalog keys aligned to the input,
// validated against DEFECT_CATALOG so a hallucinated key can never leak through.

import { openai, getFastAIModel } from "../openai";
import { DEFECT_CATALOG } from "../dealCatalog";

export type ClassifiableFinding = {
  id?: string | number;
  title?: string | null;
  observation?: string | null;
  implication?: string | null;
  section?: string | null;
};

const VALID_KEYS = new Set(DEFECT_CATALOG.map((d) => d.key));

// Compact catalog reference handed to the model: key | label | section.
const CATALOG_REF = DEFECT_CATALOG.map(
  (d) => `${d.key} | ${d.label} | ${d.section}`,
).join("\n");

function cleanStr(v: any) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

async function classifyChunk(
  chunk: ClassifiableFinding[],
): Promise<(string | null)[]> {
  const items = chunk.map((f, i) => ({
    i,
    section: cleanStr(f.section),
    title: cleanStr(f.title),
    observation: cleanStr(f.observation).slice(0, 600),
  }));

  try {
    const res = await openai.chat.completions.create({
      model: getFastAIModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You classify U.S. home-inspection findings into a fixed CATALOG of defect types.

CATALOG (format: key | label | section):
${CATALOG_REF}

For each finding, pick the SINGLE catalog key whose defect the finding actually describes, judging from its title + observation (the section is a hint, not a rule).
Rules:
- Choose a key ONLY when the finding genuinely describes that defect. Match on the real problem, not just the section name.
- If no catalog type reasonably fits, use "none". Do not force a weak match.
- Never invent a key that is not in the CATALOG.
Return ONLY valid JSON: {"assignments":[{"i":<index>,"key":"<catalog key or 'none'>"}]} with exactly one entry per finding, same indices.`,
        },
        { role: "user", content: JSON.stringify({ findings: items }) },
      ],
    });

    const raw = res.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const out: (string | null)[] = new Array(chunk.length).fill(null);
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
    for (const a of assignments) {
      const idx = Number(a?.i);
      const key = cleanStr(a?.key);
      if (Number.isInteger(idx) && idx >= 0 && idx < chunk.length) {
        out[idx] = key && key !== "none" && VALID_KEYS.has(key) ? key : null;
      }
    }
    return out;
  } catch {
    // Never throw into the caller — a classification failure just leaves those
    // findings unclassified (they fall back to "_unmatched").
    return new Array(chunk.length).fill(null);
  }
}

// Classify a list of findings, returning catalog keys (or null) aligned to the
// input order. Chunked and run in parallel so a big report classifies quickly.
export async function classifyFindingsWithAI(
  findings: ClassifiableFinding[],
): Promise<(string | null)[]> {
  if (!findings.length) return [];
  const CHUNK = 20;
  const chunks: ClassifiableFinding[][] = [];
  for (let i = 0; i < findings.length; i += CHUNK) {
    chunks.push(findings.slice(i, i + CHUNK));
  }
  const results = await Promise.all(chunks.map((c) => classifyChunk(c)));
  return results.flat();
}

// =====================================================================
// FLOW WRITER — the one AI finding-writer brain used everywhere.
//
// Every AI text path in the app (field tool, live camera, voice, photo-only,
// inspector notes, bulk capture, offline sync) should build its system prompt
// from THIS core so the voice, vocabulary, and quality are identical no matter
// how the inspector captured the finding.
//
// It composes four ingredients into one system prompt:
//   1. Contract   — canonical O/I/R schema, the 12 sections, the 6-severity
//                   ladder, and the hard "never fabricate" rules.
//   2. Voice      — the company AI Writing Studio style (buildWritingStyleInstructions).
//   3. Knowledge  — matched DefectDatabase records (causes / risks / tips).
//   4. Brain      — the inspector's learned edit-patterns (LearningEngine) plus
//                   few-shot examples retrieved from their OWN published findings.
//
// Ingredients 2–4 are per-inspector, so the same core gets smarter for each
// inspector as they edit and publish. All loads are defensive: any miss falls
// back to a still-complete prompt, so callers can use it unconditionally.
// Server-only.
// =====================================================================

import { FLOW_SECTIONS, FLOW_SEVERITIES } from "../routeFindingSection";
import {
  buildWritingStyleInstructions,
  DEFAULT_AI_WRITING_CONFIG,
  type AiWritingConfig,
} from "./writingStyle";
import {
  loadWritingConfigForInspection,
  loadWritingConfigForUser,
} from "./loadWritingConfig";
import { learningEngine } from "./LearningEngine";
import { defectDatabase } from "./knowledge/DefectDatabase";
import {
  getInspectorFindingExamples,
  formatExamplesForPrompt,
  resolveInspectorId,
} from "./findingRetrieval";

export { FLOW_SECTIONS, FLOW_SEVERITIES };

// ---------------------------------------------------------------------
// 1. Contract — the canonical finding schema + rules (shared by all routes).
// ---------------------------------------------------------------------

const SEVERITY_GUIDE = `Severity ladder (choose exactly one, least -> most serious):
- Informational: a note or general observation; no action required.
- Monitor: minor, watch over time; not yet a repair.
- Maintenance: routine upkeep a homeowner is expected to perform.
- Recommended Repair: a real defect that should be corrected by a qualified trade.
- Safety Concern: a condition that can injure people (shock, fall, burn, fire, gas, CO).
- Major Concern: significant/expensive defect or a component at/near failure.`;

export function buildFindingContract(): string {
  return `You are FLOW Writer, the report-writing engine for a professional U.S. home inspection.
Write a single finding as clear, factual, client-readable prose in the inspector's voice.

Return ONE finding as an object with these fields:
- title: a short, specific noun phrase (the defect/observation), no severity words.
- section: EXACTLY one of: ${FLOW_SECTIONS.join(" | ")}.
- severity: EXACTLY one of: ${FLOW_SEVERITIES.join(" | ")}.
- location: where in/on the home it was observed, if known (else omit/empty).
- observation: what was actually seen — concrete, specific, no speculation.
- implication: why it matters — the risk or consequence if left uncorrected.
- recommendation: the corrective action, naming the qualified trade to evaluate/repair.

${SEVERITY_GUIDE}

Hard rules — these override every style/voice instruction below:
- NEVER invent evidence. Describe only what the input supports. If a field is unknown, keep it brief or omit it rather than guessing a brand, measurement, cause, or code citation.
- Do not upgrade or downgrade severity for drama; match it to what is actually described.
- Keep it professional and free of blame toward any person.
- Route the finding to the single most correct section from the list; never invent a section or severity outside the allowed values.`;
}

// ---------------------------------------------------------------------
// 3. Knowledge — matched DefectDatabase records for the draft subject.
// ---------------------------------------------------------------------

export function buildDefectKnowledge(subject?: string): string {
  const text = String(subject || "").toLowerCase().trim();
  if (!text) return "";
  const hits = defectDatabase
    .all()
    .filter(
      (d) =>
        text.includes(d.title.toLowerCase()) ||
        d.aliases.some((a) => text.includes(a.toLowerCase())),
    )
    .slice(0, 3);
  if (!hits.length) return "";

  const blocks = hits.map((d) => {
    const lines = [
      `- ${d.title} (typical severity: ${d.defaultSeverity})`,
      d.commonCauses?.length ? `  Common causes: ${d.commonCauses.join(", ")}.` : "",
      d.risks?.length ? `  Risks: ${d.risks.join(", ")}.` : "",
      d.recommendation ? `  Standard recommendation: ${d.recommendation}` : "",
      d.inspectorTips?.length ? `  Inspector tips: ${d.inspectorTips.join(" ")}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  });

  return [
    "RELEVANT INSPECTION KNOWLEDGE (reference only — apply if it matches what was actually observed; do not force it):",
    ...blocks,
  ].join("\n");
}

// ---------------------------------------------------------------------
// Assembly — pure composition of the parts into one system prompt.
// ---------------------------------------------------------------------

export type FlowWriterParts = {
  styleBlock?: string;
  knowledgeBlock?: string;
  learningBlock?: string;
  examplesBlock?: string;
  extra?: string; // route-specific instructions (e.g. "input is a voice transcript")
};

export function assembleFindingSystemPrompt(parts: FlowWriterParts): string {
  return [
    buildFindingContract(),
    parts.extra?.trim(),
    parts.styleBlock?.trim(),
    parts.knowledgeBlock?.trim(),
    parts.learningBlock && parts.learningBlock !== "No established inspector-specific learning patterns yet."
      ? `INSPECTOR LEARNING (how THIS inspector edits AI drafts — bias toward these):\n${parts.learningBlock.trim()}`
      : "",
    parts.examplesBlock?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------
// loadFlowWriter — the one call a route makes. Loads voice + knowledge +
// learning + examples for the current inspector/draft and returns a ready
// system prompt. Everything is best-effort; a new inspector still gets the
// full contract + style.
// ---------------------------------------------------------------------

export type FlowWriterDraft = {
  section?: string | null;
  title?: string | null;
  observation?: string | null;
  note?: string | null;
  transcript?: string | null;
  text?: string | null; // any free subject text
};

export type FlowWriterResult = {
  systemPrompt: string;
  config: AiWritingConfig;
  sections: string[];
  severities: string[];
  exampleCount: number;
};

export async function loadFlowWriter(opts: {
  userId?: string | null;
  inspectionId?: string | number | null;
  draft?: FlowWriterDraft;
  includeExamples?: boolean; // default true
  extra?: string;
}): Promise<FlowWriterResult> {
  const draft = opts.draft || {};
  const subject = [
    draft.title,
    draft.text,
    draft.note,
    draft.transcript,
    draft.observation,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  // 2. Voice — prefer inspection-scoped config, fall back to user, then default.
  let config: AiWritingConfig = DEFAULT_AI_WRITING_CONFIG;
  try {
    if (opts.inspectionId != null && opts.inspectionId !== "") {
      config = await loadWritingConfigForInspection(opts.inspectionId);
    } else if (opts.userId) {
      config = await loadWritingConfigForUser(opts.userId);
    }
  } catch {
    config = DEFAULT_AI_WRITING_CONFIG;
  }
  const styleBlock = buildWritingStyleInstructions(config);

  // 4a. Brain — learned edit patterns (per-inspector via RLS on the user client).
  let learningBlock = "";
  try {
    const patterns = await learningEngine.getPatterns(180);
    learningBlock = learningEngine.formatPatternsForPrompt(patterns);
  } catch {
    learningBlock = "";
  }

  // 3. Knowledge — matched defect records.
  const knowledgeBlock = buildDefectKnowledge(subject);

  // 4b. Brain — few-shot examples from the inspector's own published findings.
  let examplesBlock = "";
  let exampleCount = 0;
  if (opts.includeExamples !== false) {
    try {
      const inspectorId = await resolveInspectorId({
        userId: opts.userId,
        inspectionId: opts.inspectionId,
      });
      if (inspectorId) {
        const examples = await getInspectorFindingExamples({
          inspectorId,
          section: draft.section || null,
          subject,
          limit: 3,
        });
        exampleCount = examples.length;
        examplesBlock = formatExamplesForPrompt(examples);
      }
    } catch {
      examplesBlock = "";
    }
  }

  const systemPrompt = assembleFindingSystemPrompt({
    styleBlock,
    knowledgeBlock,
    learningBlock,
    examplesBlock,
    extra: opts.extra,
  });

  return {
    systemPrompt,
    config,
    sections: FLOW_SECTIONS,
    severities: FLOW_SEVERITIES,
    exampleCount,
  };
}

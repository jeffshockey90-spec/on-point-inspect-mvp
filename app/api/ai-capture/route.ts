import OpenAI from "openai";
import { NextResponse } from "next/server";
import { logAIEvent } from "../../../lib/logging";
import { routeFindingSection, normalizeSeverity } from "../../../lib/routeFindingSection";
import { getAIModel, getFastAIModel, getAIVersion } from "../../../lib/openai";
import { learningEngine } from "../../../lib/ai/LearningEngine";
import { getSessionUser } from "../../../lib/apiAuth";
import { buildWritingStyleInstructions } from "../../../lib/ai/writingStyle";
import { loadWritingConfigForUser } from "../../../lib/ai/loadWritingConfig";
import { buildDefectKnowledge } from "../../../lib/ai/flowWriter";
import { matchStandards } from "../../../lib/ai/standardsReference";
import {
  getInspectorFindingExamples,
  formatExamplesForPrompt,
} from "../../../lib/ai/findingRetrieval";
import { MATERIAL_FIELDS } from "../../../lib/ai/checklistAutofill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Field write-ups are a fast first draft the inspector reviews and edits, so
// use the fast (low-latency) model — the smart model's extra seconds per
// finding is the main thing that made the write-up feel slow to appear.
const AI_WRITER_MODEL = getFastAIModel();
const AI_WRITER_VERSION = getAIVersion("report-writer-3");

const VALID_SECTIONS = [
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

const VALID_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function safeJsonParse(value: string) {
  const clean = value.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

function normalizeSection(
  value: any,
  fallback: string,
  context?: {
    title?: string;
    observation?: string;
    implication?: string;
    recommendation?: string;
  },
) {
  const clean = cleanText(value);

  // Trust the AI's section when it's a valid one. With the inspector's note and
  // the photo, the model picks the section far more reliably than keyword
  // routing, which over-triggers on incidental words (a window finding that
  // mentions "wall", a bath fan that mentions "wire", etc.) and used to override
  // the correct choice.
  if (VALID_SECTIONS.includes(clean)) return clean;

  // Only when the model's section is vague/invalid, fall back to routing on the
  // full finding content, then to the inspector's current section.
  const routed = routeFindingSection({
    section: clean,
    title: context?.title || "",
    observation: context?.observation || "",
    implication: context?.implication || "",
    recommendation: context?.recommendation || "",
  });

  if (VALID_SECTIONS.includes(routed)) return routed;
  return VALID_SECTIONS.includes(fallback) ? fallback : "Exterior";
}

function normalizeWriterSeverity(value: any, fallback: string) {
  const normalized = normalizeSeverity(cleanText(value));
  if (VALID_SEVERITIES.includes(normalized)) return normalized;
  return VALID_SEVERITIES.includes(fallback) ? fallback : "Recommended Repair";
}

function appendMaintenance(recommendation: string, maintenanceTip: string) {
  const cleanRecommendation = cleanText(recommendation);
  const cleanMaintenance = cleanText(maintenanceTip);

  if (!cleanMaintenance) return cleanRecommendation;
  if (cleanRecommendation.toLowerCase().includes(cleanMaintenance.toLowerCase())) {
    return cleanRecommendation;
  }

  return [cleanRecommendation, `Maintenance: ${cleanMaintenance}`]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: Request) {
  let note = "";
  let inspectionId: string | number | null = null;
  // Best-effort so AI usage can be attributed to the inspector who ran it.
  const sessionUser = await getSessionUser();
  const attributedUserId = sessionUser?.id ?? null;

  try {
    const body = await req.json().catch(() => ({}));

    note = cleanText(body.note || body.transcript);
    inspectionId = body.inspectionId || body.inspection_id || null;

    const requestedSection = cleanText(body.section);
    const requestedSeverity = cleanText(body.severity);
    // Confirmed location captured in the field BEFORE generating (side/level/room,
    // side auto-filled from the phone compass). A stated fact, not an inference.
    const location = cleanText(body.location);
    const propertyYear = cleanText(body.propertyYear || body.yearBuilt || body.year_built);
    const equipmentContext = cleanText(body.equipmentContext || body.equipment_context);
    const existingObservation = cleanText(body.observation);
    const existingImplication = cleanText(body.implication);
    const existingRecommendation = cleanText(body.recommendation);
    const imageDataUrls = Array.isArray(body.images)
      ? body.images
          .map(cleanText)
          .filter((value: string) => value.startsWith("data:image/"))
          .slice(0, 4)
      : [];

    if (!note && imageDataUrls.length === 0) {
      return NextResponse.json(
        { error: "Add a note or at least one photo." },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const inspectorLearningPatterns = await learningEngine.getPatterns(180);
    const inspectorLearningMemory = learningEngine.formatPatternsForPrompt(
      inspectorLearningPatterns,
    );

    // Company AI Writing Studio preferences (SOP, length, detail, tone, per-severity).
    const writingConfig = await loadWritingConfigForUser(attributedUserId);
    const writingStyleBlock = buildWritingStyleInstructions(writingConfig);

    // Shared FLOW Writer brain: matched defect knowledge + few-shot examples
    // pulled from THIS inspector's own published findings. Best-effort — a miss
    // just leaves the (already strong) style + learning prompt untouched.
    const retrievalSubject = `${note || ""} ${existingObservation || ""}`.trim();
    const defectKnowledgeBlock = buildDefectKnowledge(retrievalSubject);

    // Standards Brain: if the note/subject names a defect tied to a recognized
    // safety standard, hand the model that standard so its recommendation aligns
    // with it (advisory reference, not a legal citation).
    const standardsContext = matchStandards(retrievalSubject)
      .map((s) => `- ${s.title} (${s.citation}): ${s.note}`)
      .join("\n");
    let publishedExamplesBlock = "";
    try {
      const examples = await getInspectorFindingExamples({
        userId: attributedUserId,
        inspectionId,
        section: requestedSection || null,
        subject: retrievalSubject,
        limit: 3,
      });
      publishedExamplesBlock = formatExamplesForPrompt(examples);
    } catch {
      publishedExamplesBlock = "";
    }

    const systemPrompt = `
You are FLOW AI Report Writer 3.0, a senior certified home inspector and careful report editor.

${
  note
    ? `The inspector's spoken or typed note is the PRIMARY SOURCE OF TRUTH and is FINAL on WHAT the defect is. Photos are supporting evidence only. The note may be a fresh description OR a direct correction of a previous AI draft — either way it OVERRIDES the photo, the examples, and any prior draft.
The title and observation MUST describe the EXACT defect the note names. If the note names a specific defect (for example "missing cover plate for an outlet"), title and describe THAT defect — do NOT substitute a different or more common defect (for example "missing GFCI") just because similar past findings or examples exist.
OBEY explicit instructions in the note as direct commands, not suggestions:
- If it states or corrects the defect ("this is not a GFCI, it's a missing cover plate"), describe what the note says it is.
- If it states a severity ("severity is monitor", "make it a safety concern"), use EXACTLY that severity.
- If it gives or corrects a title ("title it Missing Outlet Cover Plate"), use that title verbatim.
- If it states a section, use that section.
Follow the inspector's instruction even when the photo or examples suggest otherwise. Do not invent a defect that is not supported by the note or visible evidence.`
    : `No inspector note was provided. Identify the SPECIFIC defect actually visible in THIS photo and describe only what is
visibly evident. Do NOT default to the defect you most commonly write for this component — a receptacle/outlet photo is
not automatically a "missing GFCI"; a panel photo is not automatically any one issue. Look at what is actually wrong in
THIS image. Do not fabricate specifics you cannot see, and keep confidence conservative (60 or below) since there is no
inspector narration to confirm your read of the image.`
}
Do not state concealed conditions as fact.
Do not claim code violations.
Preserve uncertainty words such as possible, appeared, may, suspected, and could.
Write client-friendly, realtor-friendly language that remains accurate and non-alarmist.
Use the property's age and equipment context only to improve relevance, not to invent conditions.

CRITICAL — the inspector-specific learning memory and the example findings below are from DIFFERENT, unrelated
findings and inspections. Use them ONLY as a reference for WORDING, TONE, recommendation phrasing, and severity/section
style. NEVER copy their defect type, title, or subject onto THIS finding, and never relabel the current defect to match a
more frequent past one. Identify THIS finding solely from the inspector's note and the visible evidence in THIS photo.
Treat them as a style preference, not permission to invent, overlook, or relabel evidence.

${writingStyleBlock}
${defectKnowledgeBlock ? `\n${defectKnowledgeBlock}\n` : ""}${publishedExamplesBlock ? `\n${publishedExamplesBlock}\n` : ""}
Return ONLY valid JSON in this exact structure:
{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "maintenanceTip": "",
  "liabilityNote": "",
  "confidence": 0,
  "evidence": [],
  "sectionInfo": {}
}

Writing requirements:
- Observation: what was visibly observed or reported by the inspector. Describe the component/condition itself, NOT the photo. Never write "in this photo", "this image shows", "pictured", "shown here", or "as seen" — write a direct field observation, not a narration of an image.
- Implication: why it matters and the likely consequence if not corrected.
- Recommendation: who should evaluate/correct it and what action is appropriate.
- Maintenance tip: include only when useful; keep it separate from the core repair recommendation.
- Liability note: a short internal note explaining any cautious wording, limitation, uncertainty, or need for inspector verification. Do not use legal jargon.
- Confidence: 0-100 based on note clarity and photo support.
- Evidence: up to four short statements describing what supports the finding.
- sectionInfo: an object identifying the visible material/type for the section you assign. Include a field ONLY for the section you chose, ONLY when you can CLEARLY identify it from the photo, and choose the value ONLY from that section's allowed options below (or, if the material is clearly something not in the list, a short specific material name). Omit any field you are not sure about — accuracy over completeness; leave it out rather than guessing. If nothing is clearly identifiable, return {}.
  Allowed material/type fields per section (groupTitle: allowed options):
${JSON.stringify(MATERIAL_FIELDS)}
- Section: choose the report section for the actual component or system the defect belongs to, not the section the inspector happened to have selected. Use the visible component to decide, for example:
  - Roof, shingles, flashing, gutters, chimney exterior -> Roof
  - Siding, trim, grading, driveway, walkway, deck, porch, exterior steps -> Exterior
  - Water heater, pipes, drains, faucets, toilets, TPR valve, sump pump, hose bib -> Plumbing
  - Panel, breakers, wiring, receptacles/outlets, GFCI/AFCI, grounding/bonding -> Electrical
  - Furnace, boiler, gas line, flue -> Heating; condenser, AC, heat pump, refrigerant -> Cooling
  - Foundation, crawlspace, basement, framing/joists/beams, structural cracks -> Basement, Foundation, Crawlspace & Structure
  - Attic access, insulation, ventilation, bath/exhaust fan routing -> Attic, Insulation & Ventilation
  - Interior doors, windows, floors, walls, ceilings, stairs, handrails -> Doors, Windows & Interior
  - Dishwasher, range/cooktop/oven, microwave, disposal, built-in appliances -> Built-in Appliances
  - Garage door, opener, auto-reverse/photo eyes, fire separation -> Garage
  - Fireplace, firebox, damper, hearth -> Fireplace
- No markdown and no text outside JSON.

Allowed sections:
${VALID_SECTIONS.join(", ")}.

Allowed severities:
${VALID_SEVERITIES.join(", ")}.

Severity guide — assign the level that matches the visible evidence; do NOT default to "Recommended Repair":
- Informational: general information or a normal/typical condition; no action needed.
- Monitor: a minor condition to keep an eye on; not currently a defect.
- Maintenance: routine upkeep (servicing, cleaning, sealing, minor wear).
- Recommended Repair: a defect that should be repaired but is not an immediate hazard.
- Safety Concern: a condition that poses a safety risk to occupants.
- Major Concern: a significant or costly defect, or a system at or near failure.
`;

    const userContent: any[] = [
      {
        type: "text",
        text: `
Create one complete inspection finding.

Inspector note / voice transcript:
${note || "None — describe the finding based solely on the photo(s) provided."}

Inspector's current area (a HINT only — assign the section the note and visible evidence actually indicate, even if it differs from this):
${requestedSection || "Not specified — choose the best section from the evidence."}

Confirmed location (a STATED FACT the inspector set in the field — treat as ground truth; do NOT infer, change, or contradict it. Weave it naturally into the observation, e.g. "...at the northeast corner of the basement." If blank, do not invent a location):
${location || "Not specified"}

Recognized standard(s) relevant to the inspector's note${standardsContext ? "" : " (none matched)"}. If this finding is genuinely about the item below, make the recommendation ALIGN with the standard and you may reference it as guidance (e.g. "modern safety standards call for..."). Do NOT declare a legal code "violation" — the inspector references standards, they are not a code official. If it doesn't apply, ignore this:
${standardsContext || "None"}

Severity: assign from the severity guide above based on the visible evidence${
  requestedSeverity
    ? ` (the inspector suggested "${requestedSeverity}", but override it if the evidence points elsewhere)`
    : " — do not default to Recommended Repair"
}.

Property year built:
${propertyYear || "Unknown"}

Equipment / house context:
${equipmentContext || "None provided"}

Existing observation:
${existingObservation || "None"}

Existing implication:
${existingImplication || "None"}

Existing recommendation:
${existingRecommendation || "None"}

Inspector-specific learning memory from prior edits and decisions:
${inspectorLearningMemory || "None yet"}

Keep the inspector's intent. Improve the writing without drifting away from the documented condition.
`,
      },
      ...imageDataUrls.map((url: string) => ({
        type: "image_url",
        image_url: { url },
      })),
    ];

    const response = await openai.chat.completions.create({
      model: AI_WRITER_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_completion_tokens: 1400,
    });

    const parsed = safeJsonParse(response.choices[0]?.message?.content || "{}");
    const section = normalizeSection(parsed.section, requestedSection, {
      title: cleanText(parsed.title),
      observation: cleanText(parsed.observation) || existingObservation,
      implication: cleanText(parsed.implication) || existingImplication,
      recommendation: cleanText(parsed.recommendation) || existingRecommendation,
    });
    const severity = normalizeWriterSeverity(parsed.severity, requestedSeverity);
    const maintenanceTip = cleanText(parsed.maintenanceTip);
    const recommendation = appendMaintenance(
      cleanText(parsed.recommendation) || existingRecommendation,
      maintenanceTip,
    );

    // Keep only material fields that belong to the assigned section and carry a
    // real value — the model can't inject fields for the wrong section, and
    // uncertain/blank values are dropped so nothing is guessed into the report.
    const sectionInfo: Record<string, string> = {};
    const allowedGroups = MATERIAL_FIELDS[section]?.map((g) => g.groupTitle) || [];
    const rawInfo =
      parsed.sectionInfo && typeof parsed.sectionInfo === "object" ? parsed.sectionInfo : {};
    for (const group of allowedGroups) {
      const value = cleanText(rawInfo[group]);
      const lower = value.toLowerCase();
      if (value && lower !== "unknown" && lower !== "none" && lower !== "n/a" && lower !== "not visible") {
        sectionInfo[group] = value;
      }
    }

    const result = {
      title: cleanText(parsed.title) || "Inspection Finding",
      section,
      severity,
      observation: cleanText(parsed.observation) || existingObservation,
      implication: cleanText(parsed.implication) || existingImplication,
      recommendation,
      maintenanceTip,
      liabilityNote: cleanText(parsed.liabilityNote),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 82)),
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.map(cleanText).filter(Boolean).slice(0, 4)
        : [],
      sectionInfo,
      aiModel: AI_WRITER_MODEL,
      aiVersion: AI_WRITER_VERSION,
      photoCount: imageDataUrls.length,
      reviewRequired: true,
    };

    await logAIEvent({
      userId: attributedUserId,
      inspectionId,
      tool: "report_writer_3",
      prompt: note,
      response: {
        title: result.title,
        section: result.section,
        severity: result.severity,
        confidence: result.confidence,
        maintenanceTip: result.maintenanceTip,
        liabilityNote: result.liabilityNote,
        photoCount: result.photoCount,
        aiModel: AI_WRITER_MODEL,
        aiVersion: AI_WRITER_VERSION,
      },
      tokensUsed: response.usage?.total_tokens ?? null,
      status: "success",
    });

    return NextResponse.json(result);
  } catch (error: any) {
    await logAIEvent({
      userId: attributedUserId,
      inspectionId,
      tool: "report_writer_3",
      prompt: note,
      status: "failed",
      response: { error: error?.message || "Failed to generate AI finding." },
    });

    return NextResponse.json(
      { error: error?.message || "Failed to generate AI finding." },
      { status: 500 },
    );
  }
}

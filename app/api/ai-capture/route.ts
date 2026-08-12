import OpenAI from "openai";
import { NextResponse } from "next/server";
import { logAIEvent } from "../../../lib/logging";
import { routeFindingSection, normalizeSeverity } from "../../../lib/routeFindingSection";
import { getAIModel, getFastAIModel, getAIVersion } from "../../../lib/openai";
import { learningEngine } from "../../../lib/ai/LearningEngine";
import { getSessionUser } from "../../../lib/apiAuth";
import { buildWritingStyleInstructions } from "../../../lib/ai/writingStyle";
import { loadWritingConfigForUser } from "../../../lib/ai/loadWritingConfig";

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
  // Route on the full finding content, not just the AI's section label, so the
  // defect lands in the section its actual components/wording point to (roof,
  // plumbing, electrical, etc.) even when the model's section field is vague.
  const routed = routeFindingSection({
    section: clean,
    title: context?.title || "",
    observation: context?.observation || "",
    implication: context?.implication || "",
    recommendation: context?.recommendation || "",
  });

  if (VALID_SECTIONS.includes(routed)) return routed;
  if (VALID_SECTIONS.includes(clean)) return clean;
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
    const propertyYear = cleanText(body.propertyYear || body.yearBuilt || body.year_built);
    const equipmentContext = cleanText(body.equipmentContext || body.equipment_context);
    const existingObservation = cleanText(body.observation);
    const existingImplication = cleanText(body.implication);
    const existingRecommendation = cleanText(body.recommendation);
    const imageDataUrls = Array.isArray(body.images)
      ? body.images
          .map(cleanText)
          .filter((value: string) => value.startsWith("data:image/"))
          .slice(0, 3)
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

    const systemPrompt = `
You are FLOW AI Report Writer 3.0, a senior certified home inspector and careful report editor.

${
  note
    ? `The inspector's spoken or typed note is the PRIMARY SOURCE OF TRUTH. Photos are supporting evidence only.
Do not invent a defect that is not supported by the note or visible evidence.`
    : `No inspector note was provided. Base the finding entirely on the photo(s): describe only what is
visibly evident, do not fabricate specifics you cannot see, and keep confidence conservative (60 or
below) since there is no inspector narration to confirm your read of the image.`
}
Do not state concealed conditions as fact.
Do not claim code violations.
Preserve uncertainty words such as possible, appeared, may, suspected, and could.
Write client-friendly, realtor-friendly language that remains accurate and non-alarmist.
Use the property's age and equipment context only to improve relevance, not to invent conditions.

If inspector-specific learning memory is provided below, match this inspector's demonstrated wording,
recommendation style, and severity/section choices when supported by the visible evidence. Treat it as
a style preference, not permission to invent or overlook evidence.

${writingStyleBlock}

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
  "evidence": []
}

Writing requirements:
- Observation: what was visibly observed or reported by the inspector. Describe the component/condition itself, NOT the photo. Never write "in this photo", "this image shows", "pictured", "shown here", or "as seen" — write a direct field observation, not a narration of an image.
- Implication: why it matters and the likely consequence if not corrected.
- Recommendation: who should evaluate/correct it and what action is appropriate.
- Maintenance tip: include only when useful; keep it separate from the core repair recommendation.
- Liability note: a short internal note explaining any cautious wording, limitation, uncertainty, or need for inspector verification. Do not use legal jargon.
- Confidence: 0-100 based on note clarity and photo support.
- Evidence: up to four short statements describing what supports the finding.
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
`;

    const userContent: any[] = [
      {
        type: "text",
        text: `
Create one complete inspection finding.

Inspector note / voice transcript:
${note || "None — describe the finding based solely on the photo(s) provided."}

Preferred section:
${requestedSection || "Choose the best section."}

Preferred severity:
${requestedSeverity || "Choose the best severity."}

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

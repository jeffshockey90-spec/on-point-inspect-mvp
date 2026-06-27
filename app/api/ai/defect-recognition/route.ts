import { NextResponse } from "next/server";
import { getAIModel, getAIVersion } from "../../../../lib/openai";
import { inspectionBrain } from "../../../../lib/ai";

export const runtime = "nodejs";

const AI_MODEL = getAIModel(process.env.OPENAI_VISION_MODEL);
const AI_VERSION = getAIVersion("defect-recognition");

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

const SECTION_HINTS: Record<string, string> = {
  Exterior:
    "siding, trim, grading, drainage, decks, porches, exterior doors, walkways, driveways, exterior walls, soffit, fascia, gutters, downspouts",
  Roof:
    "roof coverings, shingles, flashing, vents, roof penetrations, chimney exterior above roof, skylights, roof drainage",
  "Basement, Foundation, Crawlspace & Structure":
    "foundation, basement, crawlspace, structural framing, joists, beams, columns, settlement, cracks, moisture intrusion below grade",
  Heating:
    "furnace, boiler, heat pump heating side, burner, flue, duct heating, heating equipment, heat exchanger, gas furnace",
  Cooling:
    "air conditioner, AC condenser, evaporator coil, cooling equipment, refrigerant lines, heat pump cooling side, condensate for cooling",
  Plumbing:
    "water heater, water supply pipes, drain pipes, fixtures, faucets, toilets, tubs, showers, leaks, sump pump, hose bibs",
  Electrical:
    "electrical panel, breakers, wiring, outlets, GFCI, AFCI, service equipment, grounding, bonding, junction boxes, switches, lights",
  Fireplace:
    "fireplace, chimney firebox, damper, hearth, gas logs, wood stove, flue serving fireplace",
  "Attic, Insulation & Ventilation":
    "attic, insulation, ventilation, bathroom exhaust termination, roof sheathing viewed from attic, vapor barrier, attic moisture",
  "Doors, Windows & Interior":
    "interior rooms, walls, ceilings, floors, stairs, handrails, guardrails, interior doors, windows, cabinets, interior finishes",
  "Built-in Appliances":
    "dishwasher, range, oven, cooktop, microwave, garbage disposal, built-in refrigerator, exhaust hood",
  Garage:
    "garage door, garage opener, auto reverse, firewall, garage receptacles, vehicle door, garage ceiling, garage walls",
};

type DefectRecognitionResult = {
  title?: string;
  section?: string;
  severity?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
  confidence?: number;
  confidenceScore?: number;
  confidence_score?: number;
  photoQuality?: string;
  photo_quality?: string;
  reviewRequired?: boolean;
  review_required?: boolean;
  detectedObjects?: string[];
  detected_objects?: string[];
  detectedMaterials?: string[];
  detected_materials?: string[];
  detectedConditions?: string[];
  detected_conditions?: string[];
  evidence?: string[];
  reasoning?: string;
  inspectorGuidance?: string;
  inspector_guidance?: string;
  flags?: string[];
};

function cleanText(value: any) {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: any, fallback = 75) {
  const number = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeSection(value: any, fallback: string) {
  const clean = cleanText(value);
  return VALID_SECTIONS.includes(clean) ? clean : fallback;
}

function normalizeSeverity(value: any, fallback: string) {
  const clean = cleanText(value);
  return VALID_SEVERITIES.includes(clean) ? clean : fallback;
}

function cleanStringArray(value: any) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 12);
}

function inferSectionFromText(text: string, fallback: string) {
  const clean = text.toLowerCase();

  const rules: Array<[string, string[]]> = [
    ["Electrical", ["breaker", "panel", "gfci", "afci", "outlet", "receptacle", "wire", "wiring", "junction", "double tap", "double-tap", "neutral", "ground", "knockout", "service cable"]],
    ["Roof", ["roof", "shingle", "flashing", "ridge", "valley", "skylight", "roof vent", "drip edge", "kickout"]],
    ["Plumbing", ["water heater", "pipe", "drain", "trap", "toilet", "sink", "faucet", "shower", "tub", "leak", "sump", "hose bib", "water supply"]],
    ["Heating", ["furnace", "boiler", "burner", "heat exchanger", "flue", "heater", "heating"]],
    ["Cooling", ["air conditioner", "a/c", "ac condenser", "condenser", "evaporator", "refrigerant", "cooling", "condensate"]],
    ["Built-in Appliances", ["dishwasher", "range", "oven", "cooktop", "microwave", "disposal", "appliance"]],
    ["Garage", ["garage", "garage door", "opener", "auto reverse"]],
    ["Attic, Insulation & Ventilation", ["attic", "insulation", "ventilation", "bath fan", "bathroom exhaust", "soffit vent", "gable vent"]],
    ["Basement, Foundation, Crawlspace & Structure", ["foundation", "crawlspace", "crawl space", "basement", "joist", "beam", "column", "structural", "settlement"]],
    ["Fireplace", ["fireplace", "firebox", "damper", "hearth", "wood stove", "gas logs"]],
    ["Doors, Windows & Interior", ["window", "door", "interior", "wall", "ceiling", "floor", "stair", "handrail", "guardrail", "tread", "riser"]],
    ["Exterior", ["siding", "trim", "grading", "grade", "downspout", "gutter", "soffit", "fascia", "deck", "porch", "walkway", "driveway"]],
  ];

  for (const [section, keywords] of rules) {
    if (keywords.some((keyword) => clean.includes(keyword))) return section;
  }

  return fallback;
}

function inferPhotoQuality(confidence: number, parsedQuality: any) {
  const clean = cleanText(parsedQuality);
  const valid = ["Excellent", "Good", "Fair", "Poor"];
  if (valid.includes(clean)) return clean;

  if (confidence >= 90) return "Excellent";
  if (confidence >= 78) return "Good";
  if (confidence >= 60) return "Fair";
  return "Poor";
}

function buildReviewFlags({
  confidence,
  photoQuality,
  observation,
  recommendation,
  flags,
}: {
  confidence: number;
  photoQuality: string;
  observation: string;
  recommendation: string;
  flags: string[];
}) {
  const reviewFlags = [...flags];

  if (confidence < 70) reviewFlags.push("Low AI confidence - inspector review required.");
  if (photoQuality === "Poor") reviewFlags.push("Photo quality appears poor - consider retaking the image.");
  if (!observation) reviewFlags.push("Observation is blank.");
  if (!recommendation) reviewFlags.push("Recommendation is blank.");

  return Array.from(new Set(reviewFlags)).slice(0, 8);
}

function defaultGuidance(confidence: number, photoQuality: string, flags: string[]) {
  if (flags.length > 0) return flags[0];
  if (photoQuality === "Poor") return "Photo quality appears limited. Move closer, reduce glare, and retake if needed.";
  if (confidence < 70) return "Review carefully before saving. AI confidence is lower than normal.";
  return "Review and edit before saving. Inspector has final say.";
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const imagesFromMulti = formData.getAll("images") as File[];
    const legacyImage = formData.get("image") as File | null;
    const images = (imagesFromMulti.length ? imagesFromMulti : legacyImage ? [legacyImage] : [])
      .filter((image) => image && image.type?.startsWith("image/"))
      .slice(0, 6);
    const note = cleanText(formData.get("note"));
    const currentSection = normalizeSection(formData.get("section"), "Exterior");
    const currentSeverity = normalizeSeverity(
      formData.get("severity"),
      "Recommended Repair"
    );

    if (!images.length) {
      return NextResponse.json(
        { error: "Add at least one photo before using AI photo recognition." },
        { status: 400 }
      );
    }

    const imageContents = await Promise.all(
      images.map(async (image, index) => {
        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Image = buffer.toString("base64");
        const mimeType = image.type || "image/jpeg";

        return {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
          },
        };
      })
    );

    const systemPrompt = `
You are On Point Inspect's AI Defect Recognition Brain.
You are acting like a senior certified home inspector reviewing field inspection photos.

Return ONLY valid JSON.
Do not use markdown.
Do not invent hidden conditions.
Do not overstate the defect.
Do not claim code violations unless a clear safety issue is visible and the wording remains general.
Do not diagnose concealed conditions as fact.
Use cautious wording when certainty is limited.
The inspector has final authority.

Your job is not just to write a finding. Your job is to inspect the visible evidence.

Analyze the photos in this order:
1. Identify the system/component shown.
2. Identify visible materials.
3. Identify the visible condition or defect.
4. Determine whether multiple photos support the same finding or show unrelated conditions.
5. Cross-check the inspector note against the images.
6. Choose the best report section.
7. Choose a conservative severity.
8. Draft a professional finding.
9. Provide confidence, evidence, and review flags.

CRITICAL MULTI-PHOTO RULE:
When multiple photos are provided, treat them as supporting views of one finding unless they clearly show unrelated issues.
If unrelated issues are visible, choose the most reportable condition and mention that other visible items should be reviewed separately only in inspector guidance, not in the client-facing finding.

CRITICAL SECTION RULE:
You MUST choose the best matching section from the Valid sections list below.
The "section" value must exactly match one of the Valid sections, character-for-character.
Do not keep the current selected section unless it is truly the best match.
Do not invent new section names.

Valid sections:
${VALID_SECTIONS.map((section) => `- ${section}: ${SECTION_HINTS[section]}`).join("\n")}

Valid severities:
${VALID_SEVERITIES.map((severity) => `- ${severity}`).join("\n")}

Severity guidance:
- Informational: descriptive only, no defect confirmed.
- Monitor: minor condition or older/wear condition that should be watched.
- Maintenance: routine maintenance or minor upkeep.
- Recommended Repair: repair/correction or specialist evaluation recommended.
- Safety Concern: clear shock, fire, fall, burn, CO, injury, or similar safety risk.
- Major Concern: significant system failure, structural concern, major water intrusion, or potentially costly defect.

Section examples:
- Electrical panel, breakers, GFCI, outlet, wiring, junction box, double tapped conductors = Electrical
- Furnace, boiler, heating equipment, flue for heating appliance = Heating
- AC condenser, cooling equipment, refrigerant lines = Cooling
- Water heater, plumbing leak, drain, faucet, shower, tub, toilet = Plumbing
- Roof shingles, flashing, vents, roof covering = Roof
- Dishwasher, oven, range, microwave, disposal = Built-in Appliances
- Garage door, opener, garage firewall, garage receptacles = Garage
- Attic insulation, attic ventilation, bathroom exhaust ending in attic = Attic, Insulation & Ventilation
- Foundation, basement, crawlspace, framing, beams, joists = Basement, Foundation, Crawlspace & Structure
- Siding, grading, exterior trim, soffit, fascia, gutters, deck = Exterior
- Interior doors, windows, walls, ceilings, floors, stairs, railings = Doors, Windows & Interior
- Fireplace, firebox, damper, hearth = Fireplace

Return this exact JSON structure:
{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "confidence": 0,
  "photoQuality": "Excellent | Good | Fair | Poor",
  "detectedObjects": [],
  "detectedMaterials": [],
  "detectedConditions": [],
  "evidence": [],
  "reasoning": "",
  "inspectorGuidance": "",
  "flags": []
}

Client-facing writing rules:
- Title should be short and specific.
- Observation describes the visible condition only.
- Implication explains why it matters.
- Recommendation says who should evaluate/repair and what should be done.
- Do not include confidence, evidence, or internal reasoning inside observation/implication/recommendation.
- Do not mention "AI" in client-facing fields.
- Do not use bullet points in client-facing fields.

Confidence rules:
- 90-100: clear photo evidence and strong agreement with note.
- 75-89: condition likely visible, some limitation.
- 60-74: condition possible but limited photo evidence.
- Below 60: unclear photo, inspector review strongly needed.
          `;

    const userPrompt = `
Analyze these field inspection photo(s) together and draft one finding that best represents the visible condition.

Number of photos provided: ${images.length}
Current selected section: ${currentSection}
Current selected severity: ${currentSeverity}
Inspector note, if any: ${note || "None"}

Important:
- Auto-select the best report section from the valid list.
- Do not simply repeat the current selected section unless it is the correct section for the visible condition.
- When multiple photos are provided, use them as supporting angles of the same finding unless they clearly show unrelated conditions.
- The finding should sound like a professional home inspection report comment.
              `;

    const brainResult = await inspectionBrain.run({
      task: "defect",
      systemPrompt,
      userPrompt,
      images: images.map((image, index) => {
        const imageUrl = (imageContents[index] as any)?.image_url?.url || "";
        const base64 = imageUrl.split(",")[1] || "";
        return {
          mimeType: image.type || "image/jpeg",
          base64,
        };
      }),
      temperature: 0.1,
      responseFormat: "json_object",
    });

    const raw = brainResult.text || "{}";
    let parsed: DefectRecognitionResult = {};

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        title: "AI Photo Finding",
        section: currentSection,
        severity: currentSeverity,
        observation: "The submitted photo should be reviewed by the inspector before saving a finding.",
        implication: "The photo analysis response could not be parsed reliably.",
        recommendation: "Review the photo and enter the finding manually as needed.",
        confidence: 35,
        photoQuality: "Poor",
        flags: ["AI response was not valid JSON."],
      };
    }

    const title = cleanText(parsed.title) || "AI Photo Finding";
    const observation = cleanText(parsed.observation);
    const implication = cleanText(parsed.implication);
    const recommendation = cleanText(parsed.recommendation);

    const fallbackText = [
      title,
      observation,
      implication,
      recommendation,
      note,
      ...cleanStringArray(parsed.detectedObjects || parsed.detected_objects),
      ...cleanStringArray(parsed.detectedConditions || parsed.detected_conditions),
    ].join(" ");

    const aiSection = normalizeSection(parsed.section, "");
    const finalSection = aiSection || inferSectionFromText(fallbackText, currentSection);
    const confidence = clampConfidence(
      parsed.confidence ?? parsed.confidenceScore ?? parsed.confidence_score,
      observation && recommendation ? 78 : 55
    );
    const photoQuality = inferPhotoQuality(
      confidence,
      parsed.photoQuality || parsed.photo_quality
    );
    const initialFlags = cleanStringArray(parsed.flags);
    const flags = buildReviewFlags({
      confidence,
      photoQuality,
      observation,
      recommendation,
      flags: initialFlags,
    });
    const reviewRequired =
      Boolean(parsed.reviewRequired || parsed.review_required) ||
      confidence < 70 ||
      photoQuality === "Poor" ||
      flags.length > 0;

    return NextResponse.json({
      title,
      section: normalizeSection(finalSection, currentSection),
      severity: normalizeSeverity(parsed.severity, currentSeverity),
      observation,
      implication,
      recommendation,

      // AI Intelligence 2.0 metadata. Existing Field Tool fields still work as-is.
      confidence,
      confidenceScore: confidence,
      photoQuality,
      reviewRequired,
      detectedObjects: cleanStringArray(parsed.detectedObjects || parsed.detected_objects),
      detectedMaterials: cleanStringArray(parsed.detectedMaterials || parsed.detected_materials),
      detectedConditions: cleanStringArray(parsed.detectedConditions || parsed.detected_conditions),
      evidence: cleanStringArray(parsed.evidence),
      reasoning: cleanText(parsed.reasoning),
      inspectorGuidance:
        cleanText(parsed.inspectorGuidance || parsed.inspector_guidance) ||
        defaultGuidance(confidence, photoQuality, flags),
      flags,
      aiModel: AI_MODEL,
      aiVersion: AI_VERSION,
      photoCount: images.length,
    });
  } catch (error: any) {
    console.error("AI defect recognition error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to analyze photo." },
      { status: 500 }
    );
  }
}

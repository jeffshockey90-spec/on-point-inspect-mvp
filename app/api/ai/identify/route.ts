import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import {
  normalizeIdentifyResult,
  IDENTIFY_SECTIONS,
  IDENTIFY_SEVERITIES,
} from "../../../../lib/ai/identifyResult";
import { BRAND_READING_RULE } from "../../../../lib/ai/brandResolver";

export const runtime = "nodejs";

// Point-and-identify: a FAST single-frame "what am I pointing at" read for the
// live camera. It only LABELS the visible component and proposes a conservative
// severity — it does NOT write a client-facing finding. When the inspector
// chooses to log it, the frame + this label seed the shared background draft
// path (lib/ai/liveDraftGen), which writes the actual cautious finding.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({} as any));
    const imageDataUrl: string = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
    const fallbackSection: string = typeof body?.section === "string" ? body.section : "Exterior";

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Point the camera at something first." },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are FLOW's component identifier for a home inspection. Look at ONE photo and identify the PRIMARY building component or system the inspector is pointing at. Think like a senior home inspector.

Return ONLY valid JSON. No markdown. Do not invent a defect that is not visibly supported. Do not overstate. The inspector has final authority.

Rules:
- "label": a short, SPECIFIC name of the component — never a bare generic noun. Name the brand/series ONLY when it is clearly legible or unmistakable (e.g. "Federal Pacific Stab-Lok electrical panel", "Rheem gas water heater"). Obey the BRAND rule below: read the printed cabinet badge, never guess a brand from appearance, and never substitute a competitor brand. If no brand is legible, leave the brand out of the label and name the component generically. When it is a building MATERIAL rather than a piece of equipment (insulation, siding, roof covering, flooring, foundation, ducting, gutters, decking, wall/ceiling finish…), name its specific TYPE from what is visible, not the category — e.g. "Blown-in fiberglass insulation" not "insulation", "Asphalt-shingle roof covering" not "roof", "Vinyl siding" not "siding", "Cast-iron drain piping" not "pipe". If a measurable attribute is plainly visible (rough insulation depth, number of panel slots), you may include it; never estimate one that isn't visible, and only note a condition when a defect is actually visible.
- "componentType": the generic component ("insulation", "electrical panel", "water heater", "furnace", "roof covering"…).
- HVAC unit type — decide from the unit's visible FORM, never by assuming "heat pump":
  - An OUTDOOR unit sitting on a pad or wall bracket with a fan, a refrigerant line set, and a compressor is the CONDENSING UNIT. A heat pump and an air-conditioner condenser look nearly identical from outside — do NOT guess between them. Read the data plate (a heat pump is labeled as such and rates both heating and cooling); if the plate is not legible, label it "outdoor condensing unit" rather than committing to heat pump vs. AC.
  - An INDOOR cabinet connected to ductwork that holds a blower and coil is the AIR HANDLER (electric / heat-pump systems) — it is NOT a "heat pump". If that indoor cabinet instead has gas or oil burners and a flue/vent pipe, it is a FURNACE. The indoor unit of a heat-pump system is an air handler; never label an indoor unit "heat pump".
- "section": the single best report section from this list, character-for-character: ${IDENTIFY_SECTIONS.join(", ")}.
- "hazard": true ONLY for a WELL-KNOWN, widely-recognized inspection hazard that is identifiable from the component itself — e.g. a Federal Pacific Stab-Lok or Zinsco/Sylvania panel, a TPR valve with no discharge pipe, knob-and-tube wiring, a missing garage fire separation. Otherwise false. Never guess a hazard.
- "hazardNote": one short clause on why it matters (general, cautious wording). Empty when hazard is false.
- "severity": one of ${IDENTIFY_SEVERITIES.join(", ")}. Choose a CONSERVATIVE severity ONLY when a defect or hazard is visibly supported. If it's just a normal component with no visible problem, use "Informational".
- "confidence": 0-100, how sure you are of the identification.
- "worthLogging": true when this is a defect, a known hazard, or a notable component worth creating a finding for; false for an unremarkable background object.

${BRAND_READING_RULE}

Return exactly:
{"label":"","componentType":"","section":"","hazard":false,"hazardNote":"","severity":"","confidence":0,"worthLogging":false}`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify the primary component in this photo. Return ONLY the JSON object.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    return NextResponse.json(normalizeIdentifyResult(parsed, fallbackSection));
  } catch (error: any) {
    console.error("AI identify error", error);
    const serviceError = classifyAIServiceError(error);
    return NextResponse.json(
      {
        error: serviceError.message,
        code: serviceError.code,
        retryable: serviceError.retryable,
        retryAfterSeconds: serviceError.retryAfterSeconds,
      },
      { status: serviceError.status },
    );
  }
}

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { logAIEvent } from "../../../lib/logging";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  if (!value || typeof value !== "string") return "";
  return value.trim();
}

export async function POST(req: Request) {
  let note = "";
  let inspectionId: string | number | null = null;

  try {
    const body = await req.json();

    note = cleanText(body.note);
    inspectionId = body.inspectionId || body.inspection_id || null;

    if (!note) {
      await logAIEvent({
        inspectionId,
        tool: "ai_capture",
        prompt: note,
        status: "failed",
        response: {
          error: "Missing inspector note.",
        },
      });

      return NextResponse.json(
        { error: "Missing inspector note." },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector writing professional inspection report comments.

Your job is to convert the inspector's quick field note into a complete, professional report finding.

The inspector note is the PRIMARY SOURCE OF TRUTH.
Use the inspector's note as the main guidance for:
- what defect or condition is being reported
- the correct system/section
- the likely severity
- the wording and context of the observation
- the implication
- the recommendation

Do not ignore the inspector note.
Do not replace the inspector note with a generic finding.
Do not invent unrelated defects.
Do not claim code violations unless the note clearly supports a safety concern.
Do not overstate the condition.
Do not diagnose concealed conditions as fact.

If the note is brief, expand it professionally using standard home inspection language.
If the note includes uncertainty, keep that uncertainty in the finding.
If the note says "possible", "appears", "suspected", or "may", use cautious language.
If the note identifies a location, include it.
If the note identifies a specific recommendation, keep it.

Return ONLY valid JSON.

Use this exact structure:

{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Writing style:
- Clear, detailed, and professional.
- Realtor-friendly but accurate.
- Client-friendly and easy to understand.
- Use complete sentences.
- Avoid alarmist language.
- Do not use markdown.
- Do not include bullet points.
- Observation should describe what was noted.
- Implication should explain why it matters.
- Recommendation should explain who should evaluate/repair and what should be done.

Allowed sections only:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.

Allowed severities only:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.

Severity guidance:
- Informational: normal descriptive information or client awareness only.
- Monitor: condition should be watched over time.
- Maintenance: routine maintenance or minor upkeep.
- Recommended Repair: repair, correction, or specialist evaluation recommended.
- Safety Concern: clear safety risk such as shock, fire, fall, burn, CO, or injury hazard.
- Major Concern: significant defect, major system failure, structural concern, or potentially costly repair.
          `,
        },
        {
          role: "user",
          content: `
Convert this inspector note into a detailed inspection finding.

Inspector note:
${note}

Important:
Base the entire finding on this note. Expand it professionally, but do not drift away from what the inspector wrote.
          `,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";

    let parsed: any = {};

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const cleanSection = VALID_SECTIONS.includes(parsed.section)
      ? parsed.section
      : "Exterior";

    const cleanSeverity = VALID_SEVERITIES.includes(parsed.severity)
      ? parsed.severity
      : "Recommended Repair";

    const result = {
      title: cleanText(parsed.title) || "Inspection Finding",
      section: cleanSection,
      severity: cleanSeverity,
      observation: cleanText(parsed.observation),
      implication: cleanText(parsed.implication),
      recommendation: cleanText(parsed.recommendation),
    };

    await logAIEvent({
      inspectionId,
      tool: "ai_capture",
      prompt: note,
      response: {
        title: result.title,
        section: result.section,
        severity: result.severity,
        model: "gpt-4o-mini",
      },
      tokensUsed: response.usage?.total_tokens ?? null,
      status: "success",
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);

    await logAIEvent({
      inspectionId,
      tool: "ai_capture",
      prompt: note,
      status: "failed",
      response: {
        error: error?.message || "Failed to generate AI finding.",
      },
    });

    return NextResponse.json(
      {
        error: error.message || "Failed to generate AI finding.",
      },
      { status: 500 }
    );
  }
}

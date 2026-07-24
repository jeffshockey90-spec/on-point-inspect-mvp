import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyAIServiceError } from "../../../lib/aiServiceError";
import { getAIModel } from "../../../lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Maintenance",
  "Monitor",
  "Informational",
];

function cleanString(value: any) {
  return String(value || "").trim();
}

function getValidSection(value: any, fallback = "Exterior") {
  const clean = cleanString(value);
  return VALID_SECTIONS.includes(clean) ? clean : fallback;
}

function getValidSeverity(value: any, fallback = "Recommended Repair") {
  const clean = cleanString(value);
  return VALID_SEVERITIES.includes(clean) ? clean : fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const transcript = cleanString(body.transcript);
    const preferredSection = getValidSection(body.section, "Exterior");
    const preferredSeverity = getValidSeverity(
      body.severity,
      "Recommended Repair"
    );

    if (!transcript) {
      return NextResponse.json(
        { error: "Missing transcript." },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector writing professional report findings for a home inspection report.

Convert the inspector's spoken shorthand into a clear, detailed, professional finding.

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

Rules:
- Do not invent facts not stated in the field note.
- You may expand shorthand into professional language if the meaning is clear.
- Keep the tone accurate, calm, and realtor-friendly.
- Use Observation, Implication, Recommendation style.
- Do not overstate risk.
- Do not mention code unless the field note specifically mentions code.
- General and Safety are NOT sections.
- Section must be one of:
${VALID_SECTIONS.join(", ")}.
- Severity must be one of:
${VALID_SEVERITIES.join(", ")}.
- Use Safety Concern only when the note clearly presents a safety risk.
- Use Major Concern only for significant defects, system failure, structural concern, active water intrusion, unsafe major equipment, or other major issue.
- Use Recommended Repair for typical repair defects.
- Use Maintenance for minor service/maintenance items.
- Use Monitor when the client should watch an item over time.
- Use Informational for non-defect information.
- Recommend the proper qualified contractor when needed, such as electrician, plumber, HVAC contractor, roofer, qualified contractor, or garage door contractor.
- If the user's preferred section or severity is reasonable, keep it.
          `,
        },
        {
          role: "user",
          content: `
Preferred section: ${preferredSection}
Preferred severity: ${preferredSeverity}

Inspector voice note:
${transcript}
          `,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const cleanSection = getValidSection(parsed.section, preferredSection);
    const cleanSeverity = getValidSeverity(parsed.severity, preferredSeverity);

    return NextResponse.json({
      title: cleanString(parsed.title) || "Inspection Finding",
      section: cleanSection,
      severity: cleanSeverity,
      observation: cleanString(parsed.observation),
      implication: cleanString(parsed.implication),
      recommendation: cleanString(parsed.recommendation),
    });
  } catch (error: any) {
    console.error("Voice finding error:", error);

    const classified = classifyAIServiceError(error);

    return NextResponse.json(
      {
        error: classified.message,
        title: classified.title,
        code: classified.code,
        retryable: classified.retryable,
        retryAfterSeconds: classified.retryAfterSeconds,
      },
      { status: classified.status },
    );
  }
}

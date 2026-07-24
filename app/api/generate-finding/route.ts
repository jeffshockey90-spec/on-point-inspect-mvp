import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAIModel } from "../../../lib/openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
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

function safeParseAI(input: string) {
  const cleaned = input
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);

  if (match) {
    return JSON.parse(match[0]);
  }

  throw new Error("AI returned invalid JSON");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const note = cleanText(body.note);
    const requestedSection = cleanText(body.section);

    if (!note) {
      return NextResponse.json(
        { error: "Inspector note is required" },
        { status: 400 }
      );
    }

    const section = VALID_SECTIONS.includes(requestedSection)
      ? requestedSection
      : "";

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector writing professional inspection report findings.

The inspector note is the PRIMARY SOURCE OF TRUTH.
Use the inspector's note as the main guidance for:
- what defect or condition is being reported
- the location or system involved
- the section
- the severity
- the observation
- the implication
- the recommendation

Do not ignore the inspector note.
Do not replace the inspector note with a generic finding.
Do not invent unrelated defects.
Do not exaggerate the concern.
Do not claim code violations unless the note clearly supports a safety concern.
Do not state concealed conditions as facts.
Do not use markdown.
Do not include text outside JSON.

If the note is short, expand it professionally using common home inspection language.
If the note uses cautious wording such as "possible", "appears", "suspected", "may", or "could", keep that uncertainty.
If the note gives a recommendation, keep that recommendation.
If the note gives a location, include that location.
If a section is provided by the inspector, strongly prefer that section unless the note clearly belongs somewhere else.

Return ONLY valid JSON.

Use this exact JSON format:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "section": "",
  "severity": ""
}

Allowed sections only:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.

Allowed severities only:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.

Severity guidance:
- Informational: normal descriptive information or client awareness only.
- Monitor: condition should be watched over time.
- Maintenance: routine maintenance or minor upkeep.
- Recommended Repair: correction, repair, or specialist evaluation recommended.
- Safety Concern: clear shock, fire, fall, burn, carbon monoxide, injury, or life-safety risk.
- Major Concern: major system failure, structural concern, significant defect, or potentially costly repair.
          `,
        },
        {
          role: "user",
          content: `
Create a detailed home inspection finding.

Requested section:
${section || "Choose the best section based on the note."}

Inspector note:
${note}

Important:
Base the entire finding on the inspector note. Expand it professionally, but do not drift away from what the inspector wrote.
          `,
        },
      ],
      temperature: 0.35,
    });

    const text = response.choices[0].message.content || "{}";
    const parsed = safeParseAI(text);

    const finalSection = VALID_SECTIONS.includes(parsed.section)
      ? parsed.section
      : section || "Exterior";

    const finalSeverity = VALID_SEVERITIES.includes(parsed.severity)
      ? parsed.severity
      : "Recommended Repair";

    return NextResponse.json({
      title: cleanText(parsed.title) || "Inspection Finding",
      observation: cleanText(parsed.observation),
      implication: cleanText(parsed.implication),
      recommendation: cleanText(parsed.recommendation),
      section: finalSection,
      severity: finalSeverity,
    });
  } catch (err: any) {
    console.error("AI ROUTE ERROR:", err);

    return NextResponse.json(
      {
        error: err.message || "Server error",
      },
      { status: 500 }
    );
  }
}
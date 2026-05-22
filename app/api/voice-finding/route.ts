import OpenAI from "openai";
import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const transcript = body.transcript;

    if (!transcript) {
      return NextResponse.json(
        { error: "Missing transcript." },
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
You are a senior certified home inspector writing professional report findings.

Convert the inspector's spoken field note into a clear, detailed, realtor-friendly inspection finding.

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
- Expand the wording professionally.
- Keep it accurate and not overly alarming.
- Use Observation, Implication, Recommendation style.
- General and Safety are NOT sections.
- Section must be one of:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.
- Severity must be one of:
Recommended Repair, Safety Concern, Major Concern, Maintenance, Monitor, Informational.
- Use Safety Concern only when the issue clearly presents a safety concern.
- Recommend evaluation or correction by the appropriate qualified contractor when needed.
          `,
        },
        {
          role: "user",
          content: `Field note: ${transcript}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const cleanSection = VALID_SECTIONS.includes(parsed.section)
      ? parsed.section
      : "Exterior";

    const cleanSeverity = VALID_SEVERITIES.includes(parsed.severity)
      ? parsed.severity
      : "Recommended Repair";

    return NextResponse.json({
      title: parsed.title || "Inspection Finding",
      section: cleanSection,
      severity: cleanSeverity,
      observation: parsed.observation || "",
      implication: parsed.implication || "",
      recommendation: parsed.recommendation || "",
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error: error.message || "Failed to generate voice finding.",
      },
      { status: 500 }
    );
  }
}
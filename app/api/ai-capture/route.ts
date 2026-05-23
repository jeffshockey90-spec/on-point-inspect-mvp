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
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const note = body.note || "";

    if (!note.trim()) {
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
You are a professional certified home inspector.

Convert quick field notes into detailed inspection findings.

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
- Write detailed professional findings.
- Use Observation, Implication, Recommendation format.
- Realtor-friendly but accurate.
- Do not exaggerate defects.
- Do not invent information not present.
- Use only these sections:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.
- Severity must be:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.
          `,
        },
        {
          role: "user",
          content: `
Inspector note:
${note}
          `,
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
        error:
          error.message ||
          "Failed to generate AI finding.",
      },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

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
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSection(value: any, fallback: string) {
  const clean = cleanText(value);
  return VALID_SECTIONS.includes(clean) ? clean : fallback;
}

function normalizeSeverity(value: any, fallback: string) {
  const clean = cleanText(value);
  return VALID_SEVERITIES.includes(clean) ? clean : fallback;
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
    const image = formData.get("image") as File | null;
    const note = cleanText(formData.get("note"));
    const currentSection = normalizeSection(formData.get("section"), "Exterior");
    const currentSeverity = normalizeSeverity(
      formData.get("severity"),
      "Recommended Repair"
    );

    if (!image) {
      return NextResponse.json(
        { error: "Add a photo before using AI photo recognition." },
        { status: 400 }
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "AI photo recognition needs an image. Videos can still be saved to the finding." },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mimeType = image.type || "image/jpeg";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector helping write a professional inspection report from a field photo.

Return ONLY valid JSON.
Do not use markdown.
Do not invent hidden conditions.
Do not overstate the defect.
If the photo is not clear enough to confirm a defect, say that the condition should be reviewed by the inspector and use cautious wording.
Use the inspector note as supporting context, but the photo is the main source.

Valid sections:
${VALID_SECTIONS.join(", ")}

Valid severities:
${VALID_SEVERITIES.join(", ")}

Return this exact JSON structure:
{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Writing style:
- Clear, detailed, professional, and client-friendly.
- Observation describes the visible condition.
- Implication explains why it matters.
- Recommendation says who should evaluate/repair and what should be done.
- Prefer conservative wording such as "appeared", "was observed", or "recommend evaluation" when certainty is limited.
          `,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze this field inspection photo and draft a finding.
Current selected section: ${currentSection}
Current selected severity: ${currentSeverity}
Inspector note, if any: ${note || "None"}
              `,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    return NextResponse.json({
      title: cleanText(parsed.title) || "AI Photo Finding",
      section: normalizeSection(parsed.section, currentSection),
      severity: normalizeSeverity(parsed.severity, currentSeverity),
      observation: cleanText(parsed.observation),
      implication: cleanText(parsed.implication),
      recommendation: cleanText(parsed.recommendation),
    });
  } catch (error: any) {
    console.error("AI defect recognition error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to analyze photo." },
      { status: 500 }
    );
  }
}

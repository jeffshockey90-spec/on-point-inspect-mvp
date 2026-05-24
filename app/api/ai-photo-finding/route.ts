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

function cleanText(value: any) {
  if (!value || typeof value !== "string") return "";
  return value.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const image = body.image;
    const inspectorNote = cleanText(
      body.inspectorNote || body.note || body.comment || ""
    );

    if (!image) {
      return NextResponse.json(
        { error: "Missing image." },
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
You are a senior certified home inspector writing professional inspection report findings.

You are analyzing ONE inspection photo and, if provided, ONE inspector field note.

The inspector note is the PRIMARY GUIDANCE.
The image is supporting evidence.

If an inspector note is provided:
- Focus the finding on the condition described in the note.
- Use the note to decide what defect or concern matters most.
- Use the photo to verify or add visible details.
- Do not drift into unrelated items just because they appear in the photo.
- Do not replace the note with a generic image description.
- If the note mentions a location, include it.
- If the note says possible, suspected, appears, may, or could, keep cautious wording.
- If the image does not clearly confirm the note, say the condition was reported/noted and recommend further evaluation as appropriate.
- If the note conflicts with the photo, do not pretend certainty. Use conservative wording.

If no inspector note is provided:
- Analyze the visible condition in the photo normally.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside the JSON.

Use this exact JSON structure:

{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "equipment_type": "",
  "manufacturer": "",
  "model_number": "",
  "serial_number": "",
  "estimated_age": "",
  "notes": ""
}

Writing rules:
- Write like a professional certified home inspector.
- Use clear Observation, Implication, Recommendation wording.
- Realtor-friendly but accurate.
- Client-friendly and easy to understand.
- Do not exaggerate issues.
- Do not invent defects.
- Do not state concealed damage as fact.
- Do not claim code violations unless the note/photo clearly supports a safety concern.
- Recommendations should name the appropriate qualified contractor when relevant.
- Observation should be specific and based on the note/photo.
- Implication should explain why the condition matters.
- Recommendation should explain what should be done next.

Allowed sections only:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.

General and Safety are NOT sections.

Allowed severity values only:
Recommended Repair, Safety Concern, Major Concern, Maintenance, Monitor, Informational.

Severity guidance:
- Informational: normal descriptive information or client awareness only.
- Monitor: condition should be watched over time.
- Maintenance: routine maintenance or minor upkeep.
- Recommended Repair: correction, repair, or specialist evaluation recommended.
- Safety Concern: clear shock, fire, fall, burn, carbon monoxide, injury, or life-safety risk.
- Major Concern: major system failure, structural concern, significant defect, structural concern, or potentially costly repair.

Equipment extraction rules:
- If this is HVAC, electrical, plumbing, appliance, or mechanical equipment, extract visible equipment data.
- Never invent serial or model numbers.
- If unreadable, leave blank.
- If visible, identify manufacturer, model number, serial number, estimated age, and equipment type.
- If photo is a data plate, focus heavily on OCR extraction.
- If condition cannot be confirmed visually, state that.
          `,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze this inspection image and create a report-ready finding.

Inspector note:
${inspectorNote || "No inspector note provided."}

Important:
If an inspector note is provided, base the finding primarily on that note. Use the image to support and refine the finding, not to replace the inspector's concern.
              `,
            },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
      temperature: 0.25,
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

    return NextResponse.json({
      title: cleanText(parsed.title) || "Inspection Finding",
      section: cleanSection,
      severity: cleanSeverity,
      observation: cleanText(parsed.observation),
      implication: cleanText(parsed.implication),
      recommendation: cleanText(parsed.recommendation),
      equipment_type: cleanText(parsed.equipment_type),
      manufacturer: cleanText(parsed.manufacturer),
      model_number: cleanText(parsed.model_number),
      serial_number: cleanText(parsed.serial_number),
      estimated_age: cleanText(parsed.estimated_age),
      notes: cleanText(parsed.notes),
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error: error.message || "Failed to analyze inspection photo.",
      },
      { status: 500 }
    );
  }
}
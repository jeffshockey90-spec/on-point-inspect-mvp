import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { logAIEvent } from "../../../lib/logging";
import { getAIModel } from "../../../lib/openai";

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

function formatInspectorMemory(memories: any[]) {
  if (!Array.isArray(memories) || memories.length === 0) return "";

  const lines = memories
    .slice(0, 20)
    .map((memory) => {
      const trigger = cleanText(memory.trigger_text);
      const section = cleanText(memory.preferred_section);
      const severity = cleanText(memory.preferred_severity);

      if (!trigger || !section) return "";

      return `- When the issue resembles "${trigger}", prefer section "${section}"${
        severity ? ` and severity "${severity}"` : ""
      }.`;
    })
    .filter(Boolean);

  if (lines.length === 0) return "";

  return `
Inspector Memory / Saved Corrections:
${lines.join("\n")}

Use these only when they support the inspector note. If an inspector note is provided, the inspector note overrides memory.
`;
}

export async function POST(req: Request) {
  let inspectionId: string | number | null = null;

  try {
    const body = await req.json();

    const image = body.image;
    inspectionId = body.inspectionId || body.inspection_id || null;

    const inspectorNote = cleanText(
      body.inspectorNote || body.note || body.comment || ""
    );

    let inspectorMemoryGuidance = "";

    try {
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: memories } = await supabase
          .from("ai_inspector_memory")
          .select("trigger_text, preferred_section, preferred_severity, created_at")
          .eq("inspector_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        inspectorMemoryGuidance = formatInspectorMemory(memories || []);
      }
    } catch {
      inspectorMemoryGuidance = "";
    }

    if (!image) {
      await logAIEvent({
        inspectionId,
        tool: "ai_capture",
        prompt: inspectorNote,
        status: "failed",
        response: {
          error: "Missing image.",
        },
      });

      return NextResponse.json(
        { error: "Missing image." },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: {
        type: "json_object",
      },
      temperature: 0.15,
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector writing professional inspection report findings.

You are analyzing ONE inspection photo and, if provided, ONE inspector field note.

The inspector note is the PRIMARY SOURCE OF TRUTH.

CRITICAL RULES:

1. If an inspector note is provided, the finding MUST be based on the inspector note.

2. The photo exists only to provide visual confirmation and supporting details.

3. NEVER ignore the inspector note in favor of another visible condition.

4. NEVER create a finding for a background item when the inspector note identifies the concern.

5. If the note says "plumbing leak", then the finding must be Plumbing even if electrical equipment is visible.

6. If the note says "electrical issue", then the finding must be Electrical even if plumbing is visible.

7. If the note identifies a specific defect, section, location, or component, that information takes precedence over image interpretation.

8. Only create ONE finding.

9. Do not combine multiple defects.

10. Do not create findings for unrelated visible items.

11. When a note is present: NOTE > INSPECTOR MEMORY > IMAGE.

12. The inspector note should influence section selection, severity selection, title, observation, implication, and recommendation.

13. If the note and image appear inconsistent, follow the note and use conservative wording such as "reported", "observed", "appears", or "recommend further evaluation."

If no inspector note is provided:
- Analyze the main visible inspection concern in the photo normally.
- Create only one finding.
- Do not create findings for background items.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside the JSON.

${inspectorMemoryGuidance}

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
- If this is HVAC, electrical, plumbing, appliance, or mechanical equipment, extract visible equipment data only if relevant to the inspector note or main photo subject.
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

The inspector note is the defect to be reported.

Do NOT search the image for a different defect.

Do NOT replace the inspector's concern with a different visible condition.

Use the image only to add visual details to the defect described by the inspector.

Create exactly ONE finding based on the inspector note when provided.
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
      equipment_type: cleanText(parsed.equipment_type),
      manufacturer: cleanText(parsed.manufacturer),
      model_number: cleanText(parsed.model_number),
      serial_number: cleanText(parsed.serial_number),
      estimated_age: cleanText(parsed.estimated_age),
      notes: cleanText(parsed.notes),
    };

    await logAIEvent({
      inspectionId,
      tool: "ai_capture",
      prompt: inspectorNote,
      response: {
        title: result.title,
        section: result.section,
        severity: result.severity,
        equipment_type: result.equipment_type,
        manufacturer: result.manufacturer,
        model_number: result.model_number,
        serial_number: result.serial_number,
        estimated_age: result.estimated_age,
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
      status: "failed",
      response: {
        error: error?.message || "Failed to analyze inspection photo.",
      },
    });

    return NextResponse.json(
      {
        error: error.message || "Failed to analyze inspection photo.",
      },
      { status: 500 }
    );
  }
}
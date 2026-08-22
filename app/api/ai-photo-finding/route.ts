import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { logAIEvent } from "../../../lib/logging";
import { getAIModel } from "../../../lib/openai";
import { getSessionUser } from "../../../lib/apiAuth";
import { loadFlowWriter, FLOW_SECTIONS, FLOW_SEVERITIES } from "../../../lib/ai/flowWriter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VALID_SECTIONS = FLOW_SECTIONS;
const VALID_SEVERITIES = FLOW_SEVERITIES;

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
  // Best-effort so AI usage can be attributed to the inspector who ran it.
  const sessionUser = await getSessionUser();
  const attributedUserId = sessionUser?.id ?? null;

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
        userId: attributedUserId,
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

    // Build the shared FLOW Writer brain (voice + learning + knowledge +
    // this inspector's own published examples), then layer the photo-specific
    // rules on top so vision capture writes with the same voice as everything else.
    const { systemPrompt: flowPrompt } = await loadFlowWriter({
      userId: attributedUserId,
      inspectionId,
      draft: { note: inspectorNote },
      extra: `INPUT: ONE inspection photo and, if provided, ONE inspector field note.

Note-vs-image precedence:
- When an inspector note is provided it is the PRIMARY SOURCE OF TRUTH; the finding MUST be about the note's concern. The photo only adds visual confirmation and detail.
- NEVER swap the inspector's concern for a different visible condition or a background item. If the note says "plumbing leak", the finding is Plumbing even if electrical gear is visible (and vice-versa). Precedence when a note is present: NOTE > INSPECTOR MEMORY > IMAGE.
- If note and image seem inconsistent, follow the note and use conservative wording ("reported", "observed", "appears", "recommend further evaluation").
- If NO note is provided, analyze the single main visible concern in the photo. Create exactly ONE finding; do not combine defects or report background items.

Image-narration discipline:
- Describe the component/condition itself, NOT the photo. Never write "in this photo", "this image shows", "pictured", "shown here", or "as seen" — write it as a direct field observation.

Equipment extraction (only if HVAC/electrical/plumbing/appliance/mechanical and relevant to the note or main subject):
- Extract manufacturer, model_number, serial_number, estimated_age, equipment_type from a visible data plate. Never invent serial/model numbers; leave blank if unreadable. If the photo is a data plate, focus heavily on OCR.

Return ONLY valid JSON (no markdown, no prose outside the JSON) with EXACTLY these keys:
{"title":"","section":"","severity":"","observation":"","implication":"","recommendation":"","equipment_type":"","manufacturer":"","model_number":"","serial_number":"","estimated_age":"","notes":""}`,
    });

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: {
        type: "json_object",
      },
      temperature: 0.15,
      messages: [
        {
          role: "system",
          content: `${flowPrompt}${inspectorMemoryGuidance ? `\n\n${inspectorMemoryGuidance}` : ""}`,
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
      userId: attributedUserId,
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
      userId: attributedUserId,
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
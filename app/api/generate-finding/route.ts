import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAIModel } from "../../../lib/openai";
import { createClient } from "../../../utils/supabase/server";
import { loadFlowWriter, FLOW_SECTIONS, FLOW_SEVERITIES } from "../../../lib/ai/flowWriter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const VALID_SECTIONS = FLOW_SECTIONS;

const VALID_SEVERITIES = FLOW_SEVERITIES;

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
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    if (!note) {
      return NextResponse.json(
        { error: "Inspector note is required" },
        { status: 400 }
      );
    }

    const section = VALID_SECTIONS.includes(requestedSection)
      ? requestedSection
      : "";

    // Identify the inspector from the session so the write-up uses THEIR
    // voice, learned edits, and published examples — the shared FLOW Writer.
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const { systemPrompt } = await loadFlowWriter({
      userId,
      inspectionId,
      draft: { note, section: section || null },
      extra: `INPUT: a short inspector note that is the PRIMARY SOURCE OF TRUTH. Base the entire finding on it — do not drift, do not invent unrelated defects, do not exaggerate the concern.
- If the note is short, expand it professionally using common home inspection language, without adding facts it does not state.
- If the note uses cautious wording such as "possible", "appears", "suspected", "may", or "could", keep that uncertainty.
- If the note gives a recommendation, keep that recommendation. If it gives a location, include that location.
- If a section is provided by the inspector, strongly prefer that section unless the note clearly belongs somewhere else.
- Do not use markdown. Do not include any text outside the JSON.
Return ONLY valid JSON with keys: title, observation, implication, recommendation, section, severity.`,
    });

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: systemPrompt,
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
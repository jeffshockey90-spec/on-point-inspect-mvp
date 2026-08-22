import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyAIServiceError } from "../../../lib/aiServiceError";
import { getAIModel } from "../../../lib/openai";
import { createClient } from "../../../utils/supabase/server";
import { loadFlowWriter, FLOW_SECTIONS, FLOW_SEVERITIES } from "../../../lib/ai/flowWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VALID_SECTIONS = FLOW_SECTIONS;
const VALID_SEVERITIES = FLOW_SEVERITIES;

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
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    if (!transcript) {
      return NextResponse.json(
        { error: "Missing transcript." },
        { status: 400 }
      );
    }

    // Identify the inspector from the session so voice write-ups use THEIR
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
      draft: { transcript, section: preferredSection },
      extra: `INPUT: the inspector's spoken shorthand (a voice note). Expand it into a full professional finding — you MAY expand shorthand when the meaning is clear, but never add facts the note does not state.
- If the inspector's preferred section (${preferredSection}) or severity (${preferredSeverity}) is reasonable for what they described, keep it.
- "location": the specific room/area/spot the inspector names (e.g. "master bathroom", "attic above the garage", "kitchen sink cabinet). Extract it into the location field so it can prefill the finding. Leave it empty if no location is stated — do NOT invent one.
- Do not mention code unless the voice note specifically mentions code.
Return ONLY valid JSON with keys: title, section, severity, location, observation, implication, recommendation.`,
    });

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: {
        type: "json_object",
      },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Preferred section: ${preferredSection}
Preferred severity: ${preferredSeverity}

Inspector voice note:
${transcript}`,
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
      location: cleanString(parsed.location),
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

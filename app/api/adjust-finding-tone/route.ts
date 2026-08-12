import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../lib/openai";
import { buildWritingStyleInstructions } from "../../../lib/ai/writingStyle";
import {
  loadWritingConfigForInspection,
  loadWritingConfigForUser,
} from "../../../lib/ai/loadWritingConfig";
import { getSessionUser } from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Preset instructions the UI exposes as one-tap buttons. A free-text
// instruction (body.instruction) overrides / augments these.
const PRESETS: Record<string, string> = {
  calmer:
    "Make the wording calmer and less alarming. Remove dramatic or fear-based phrasing while keeping every fact and the same severity.",
  shorter: "Make it more concise — trim to the essential point without losing meaning.",
  detailed:
    "Add helpful detail, including the implication and the risk chain (what happens if it is not corrected).",
  technical: "Make it more precise and technical, appropriate for a detailed report.",
  simpler: "Use plainer, more client-friendly language with less jargon.",
};

function clean(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const title = clean(body.title);
    const severity = clean(body.severity);
    const observation = clean(body.observation);
    const implication = clean(body.implication);
    const recommendation = clean(body.recommendation);
    const preset = clean(body.preset);
    const customInstruction = clean(body.instruction);
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    if (!observation && !implication && !recommendation) {
      return NextResponse.json(
        { error: "Nothing to adjust yet." },
        { status: 400 },
      );
    }

    const instruction =
      [PRESETS[preset], customInstruction].filter(Boolean).join(" ") ||
      "Improve the writing while keeping all facts and the same severity.";

    // Keep the adjustment on-brand with the company's writing settings.
    let writingConfig = null as any;
    if (inspectionId != null && inspectionId !== "") {
      writingConfig = await loadWritingConfigForInspection(inspectionId);
    } else {
      const user = await getSessionUser();
      writingConfig = await loadWritingConfigForUser(user?.id ?? null);
    }
    const styleBlock = buildWritingStyleInstructions(writingConfig);

    const systemPrompt = `You revise home inspection finding narratives on request.
You may change the WORDING and TONE, but never the underlying facts, measurements, or the safety meaning.
Never downplay, minimize, or remove a genuine safety hazard — you may soften tone but not substance.
Do not invent new evidence. Keep it professional and liability-safe.

${styleBlock}`;

    const userPrompt = `Revise this finding per the instruction below.

Title: ${title || "(none)"}
Severity: ${severity || "(unspecified)"}
Observation: ${observation || "(none)"}
Implication: ${implication || "(none)"}
Recommendation: ${recommendation || "(none)"}

Instruction: ${instruction}

Return ONLY valid JSON in this exact shape (keep any field that should not change the same):
{"observation":"","implication":"","recommendation":""}`;

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    return NextResponse.json({
      observation: clean(parsed.observation) || observation,
      implication: clean(parsed.implication) || implication,
      recommendation: clean(parsed.recommendation) || recommendation,
    });
  } catch (error: any) {
    console.error("adjust-finding-tone error:", error);
    return NextResponse.json(
      { error: error?.message || "Adjust failed." },
      { status: 500 },
    );
  }
}

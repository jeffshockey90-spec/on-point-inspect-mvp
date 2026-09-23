import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAIModel } from "../../../../lib/openai";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";
import { buildWritingStyleInstructions } from "../../../../lib/ai/writingStyle";
import { loadWritingConfigForInspection } from "../../../../lib/ai/loadWritingConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function clean(v: any) {
  return String(v ?? "").trim();
}

// Generate a short, accurate title for a finding from its CURRENT content, so the
// title always matches the defect after it's edited or combined. Two modes:
//  - { inspectionId, findingId }        -> loads the finding, retitles it, saves.
//  - { inspectionId, content: {...} }   -> just returns a title (for an unsaved
//                                          draft in the live camera / field tool).
// Never invents facts; the title only summarizes what's already written.
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const findingId = clean(body?.findingId || body?.finding_id);
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Resolve the content to title from: a saved finding, or the raw content
    // passed for an unsaved draft.
    let source: any = body?.content || {};
    if (findingId) {
      const { data: target, error } = await admin
        .from("findings")
        .select("section, severity, observation, implication, recommendation, title")
        .eq("id", findingId)
        .eq("inspection_id", inspectionId)
        .maybeSingle();
      if (error) throw error;
      if (!target) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
      source = target;
    }

    const observation = clean(source.observation);
    const implication = clean(source.implication);
    const recommendation = clean(source.recommendation);
    if (!observation && !implication && !recommendation) {
      return NextResponse.json(
        { error: "Nothing to title yet — add the finding's details first." },
        { status: 400 },
      );
    }

    const writingConfig = await loadWritingConfigForInspection(inspectionId);
    const styleBlock = buildWritingStyleInstructions(writingConfig);

    const systemPrompt = `You write the SHORT TITLE for a home inspection finding. The title is a concise label (typically 3–8 words) that names the defect and, where they matter, the affected component/locations. It must accurately match the finding's content — never invent, exaggerate, or add anything not in the observation/implication/recommendation. No trailing period. Title case. Do not restate the severity word ("Safety Concern", etc.) in the title.

${styleBlock}

Return ONLY valid JSON: {"title":""}`;

    const userPrompt = `Write the title for this finding:
Section: ${clean(source.section) || "?"}, Severity: ${clean(source.severity) || "?"}
Observation: ${observation}
Implication: ${implication}
Recommendation: ${recommendation}`;

    const aiResponse = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(aiResponse.choices[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    const title = clean(parsed.title);
    if (!title) {
      return NextResponse.json({ error: "Could not generate a title." }, { status: 502 });
    }

    if (findingId) {
      const { error: updateError } = await admin
        .from("findings")
        .update({ title })
        .eq("id", findingId)
        .eq("inspection_id", inspectionId);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ ok: true, title });
  } catch (error: any) {
    console.error("Retitle error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retitle the finding." },
      { status: 500 },
    );
  }
}

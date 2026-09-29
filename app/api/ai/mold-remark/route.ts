import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";
import { openai, getAIModel, getAIVersion, requireOpenAIKey } from "../../../../lib/openai";
import { logAIEvent } from "../../../../lib/logging";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// pdf-parse's package index runs a debug harness on import (reads a test file),
// so import the internal module directly. createRequire is needed under ESM.
const require = createRequire(import.meta.url);
const supabaseAdmin = getAdminClient();

// pdf-parse frequently emits NUL bytes (Postgres text columns reject them) and
// collapses whitespace oddly — clean before prompting/storing.
function cleanPdfText(text: string) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  let inspectionId: any = null;
  let userId: string | null = null;
  try {
    requireOpenAIKey();

    const user = await getSessionUser();
    if (!user) return unauthorized();
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    inspectionId = body.inspectionId || body.inspection_id;
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const inspection = await authorizeInspection(supabaseAdmin, user.id, inspectionId, "id");
    if (!inspection) return notFound("Inspection not found.");

    const { data: moldTest } = await supabaseAdmin
      .from("mold_tests")
      .select("*")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    const labUrl = String(moldTest?.lab_report_url || "").trim();
    if (!labUrl) {
      return NextResponse.json(
        { error: "Upload the mold lab report PDF first, then draft the summary." },
        { status: 400 },
      );
    }

    // Read the uploaded lab PDF and extract its text.
    const pdfRes = await fetch(labUrl);
    if (!pdfRes.ok) {
      return NextResponse.json(
        { error: "Could not open the uploaded lab report. Re-upload it and try again." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await pdfRes.arrayBuffer());

    let labText = "";
    try {
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const result = await pdfParse(buffer);
      labText = cleanPdfText(result?.text || "");
    } catch {
      labText = "";
    }

    if (labText.replace(/\s/g, "").length < 40) {
      return NextResponse.json(
        {
          error:
            "Couldn't read text from this PDF — it may be a scanned image. You can type the summary manually below.",
        },
        { status: 422 },
      );
    }

    const labExcerpt = labText.slice(0, 12000);
    const airSamples = Number(moldTest?.air_samples) || 0;
    const surfaceSamples = Number(moldTest?.surface_samples) || 0;

    const systemPrompt = `You are writing a short, plain-English MOLD LABORATORY RESULTS summary for a HOME INSPECTION CLIENT (a homeowner or buyer), based ONLY on the lab report text provided.

Rules:
- Write for a non-technical homeowner: clear, calm, and easy to understand. Never alarming.
- Summarize what the lab actually reported — which samples were taken, the overall result (for example whether indoor mold spore levels were comparable to or higher than the outdoor baseline), and any mold types the lab specifically flagged as elevated. Use the lab's own findings; do NOT invent numbers, spore counts, or results that are not in the text.
- You are NOT a doctor. Do NOT give medical or health advice, do NOT describe symptoms or health effects, and do NOT diagnose. If the report mentions health, keep it general and defer to appropriate professionals.
- Never state anything as a guarantee. Frame results as "at the time of testing" and "at the sampled locations."
- If the results indicate elevated or concerning mold, recommend further evaluation and/or remediation by a qualified mold remediation contractor. If the results appear normal, say so plainly without over-promising.
- The inspector reviews and approves this before it is shared and has final say.
- Output 1 to 3 short paragraphs of plain prose. No headings, no markdown, no bullet lists, no raw lab tables or jargon.`;

    const userPrompt = `Mold sampling context:
- Air samples: ${airSamples}
- Surface/tape/swab samples: ${surfaceSamples}
- Lab name: ${moldTest?.lab_name || "Not specified"}
- Inspector-entered lab status: ${moldTest?.lab_status || "Not specified"}
${moldTest?.notes ? `- Inspector notes: ${moldTest.notes}` : ""}

Laboratory report text (extracted from the uploaded PDF):
"""
${labExcerpt}
"""

Write the client-friendly mold results summary now.`;

    const model = getAIModel();

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
    } catch (error: any) {
      const svc = classifyAIServiceError(error);
      await logAIEvent({
        userId,
        inspectionId,
        tool: "mold_remark",
        status: "failed",
        response: { code: svc.code, error: svc.technicalMessage || svc.message },
      });
      return NextResponse.json(
        { error: svc.message, title: svc.title, code: svc.code, retryable: svc.retryable },
        { status: svc.status },
      );
    }

    const remark = String(completion.choices?.[0]?.message?.content || "").trim();
    if (!remark) {
      return NextResponse.json(
        { error: "The AI could not draft a summary from this report. Please try again." },
        { status: 500 },
      );
    }

    // Persist the draft so it survives a reload / other devices. Best-effort: if
    // the ai_remark column isn't there yet (pre-migration) the inspector still
    // gets the draft and can save it after running the SQL.
    let saved = true;
    try {
      const { error: updateError } = await supabaseAdmin
        .from("mold_tests")
        .update({ ai_remark: remark, ai_remark_generated_at: new Date().toISOString() })
        .eq("inspection_id", inspectionId);
      if (updateError) saved = false;
    } catch {
      saved = false;
    }

    await logAIEvent({
      userId,
      inspectionId,
      tool: "mold_remark",
      prompt: "Mold lab report summary",
      response: { length: remark.length, saved },
      tokensUsed: completion.usage?.total_tokens ?? null,
      status: "success",
      model,
      aiVersion: getAIVersion("mold-remark"),
    });

    return NextResponse.json({ success: true, remark, saved });
  } catch (error: any) {
    const svc = classifyAIServiceError(error);
    await logAIEvent({
      userId,
      inspectionId,
      tool: "mold_remark",
      status: "failed",
      response: { error: String(error?.message || error) },
    }).catch(() => {});
    return NextResponse.json(
      { error: svc.message || error?.message || "Failed to draft the mold summary." },
      { status: svc.status || 500 },
    );
  }
}

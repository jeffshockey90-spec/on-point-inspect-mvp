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

const require = createRequire(import.meta.url);
const supabaseAdmin = getAdminClient();

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

    const { data: radonTest } = await supabaseAdmin
      .from("radon_tests")
      .select("*")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    const dbUrl = String(radonTest?.report_url || "").trim();
    const bodyUrl = String(body.reportUrl || body.report_url || "").trim();
    const supabaseBase = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const bodyUrlAllowed =
      bodyUrl && supabaseBase && bodyUrl.startsWith(supabaseBase) ? bodyUrl : "";

    const reportUrl = dbUrl || bodyUrlAllowed;
    if (!reportUrl) {
      return NextResponse.json(
        { error: "Upload the radon device report PDF first, then draft the summary." },
        { status: 400 },
      );
    }

    const pdfRes = await fetch(reportUrl);
    if (!pdfRes.ok) {
      return NextResponse.json(
        { error: "Could not open the uploaded radon report. Re-upload it and try again." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await pdfRes.arrayBuffer());

    let reportText = "";
    try {
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const result = await pdfParse(buffer);
      reportText = cleanPdfText(result?.text || "");
    } catch {
      reportText = "";
    }

    if (reportText.replace(/\s/g, "").length < 40) {
      return NextResponse.json(
        {
          error:
            "Couldn't read text from this PDF — it may be a scanned image. You can type the summary manually below.",
        },
        { status: 422 },
      );
    }

    const excerpt = reportText.slice(0, 12000);
    const avg = radonTest?.average_pci;

    const systemPrompt = `You are writing a short, plain-English RADON RESULTS summary for a HOME INSPECTION CLIENT (a homeowner or buyer), based ONLY on the radon report text provided.

Rules:
- Write for a non-technical homeowner: clear, calm, easy to understand. Never alarming.
- Summarize what the report actually shows — the average radon concentration in pCi/L, the test duration/dates and device if stated, and how the average compares to the EPA action level of 4.0 pCi/L. Use the report's own numbers; do NOT invent readings not in the text.
- Reference points, stated plainly: 4.0 pCi/L is the EPA action level (mitigation recommended at or above it); 2.0–3.9 pCi/L is below the action level but the EPA suggests considering mitigation; below 2.0 is low.
- You are NOT a doctor. Do NOT give medical or health advice, do NOT describe health effects or symptoms, and do NOT diagnose. If health is mentioned, keep it general and defer to the EPA and appropriate professionals.
- Never state anything as a guarantee. Frame results as "at the time of testing."
- If the average is at or above 4.0 pCi/L, recommend mitigation by a qualified radon mitigation contractor. If it is below, say so plainly without over-promising, and note that radon levels can change over time.
- The inspector reviews and approves this before it is shared and has final say.
- Output 1 to 3 short paragraphs of plain prose. No headings, no markdown, no bullet lists, no raw device tables.`;

    const userPrompt = `Radon testing context:
- Inspector-entered average: ${avg !== null && avg !== undefined && String(avg).trim() !== "" ? `${avg} pCi/L` : "Not specified"}
- Device: ${radonTest?.device_name || "Not specified"}
- Report status: ${radonTest?.report_status || "Not specified"}
${radonTest?.notes ? `- Inspector notes: ${radonTest.notes}` : ""}

Radon report text (extracted from the uploaded PDF):
"""
${excerpt}
"""

Write the client-friendly radon results summary now.`;

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
        tool: "radon_remark",
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

    let saved = true;
    try {
      const stamp = new Date().toISOString();
      if (radonTest?.id) {
        const { error: updateError } = await supabaseAdmin
          .from("radon_tests")
          .update({ ai_remark: remark, ai_remark_generated_at: stamp })
          .eq("inspection_id", inspectionId);
        if (updateError) saved = false;
      } else {
        const { error: insertError } = await supabaseAdmin.from("radon_tests").insert({
          inspection_id: inspectionId,
          report_url: reportUrl,
          report_status: "Pending",
          result: "Pending",
          ai_remark: remark,
          ai_remark_generated_at: stamp,
        });
        if (insertError) saved = false;
      }
    } catch {
      saved = false;
    }

    await logAIEvent({
      userId,
      inspectionId,
      tool: "radon_remark",
      prompt: "Radon report summary",
      response: { length: remark.length, saved },
      tokensUsed: completion.usage?.total_tokens ?? null,
      status: "success",
      model,
      aiVersion: getAIVersion("radon-remark"),
    });

    return NextResponse.json({ success: true, remark, saved });
  } catch (error: any) {
    const svc = classifyAIServiceError(error);
    await logAIEvent({
      userId,
      inspectionId,
      tool: "radon_remark",
      status: "failed",
      response: { error: String(error?.message || error) },
    }).catch(() => {});
    return NextResponse.json(
      { error: svc.message || error?.message || "Failed to draft the radon summary." },
      { status: svc.status || 500 },
    );
  }
}

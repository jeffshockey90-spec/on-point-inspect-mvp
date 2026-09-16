import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { assertIsReinspection, OriginalReportWriteError } from "../../../../lib/reinspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Draft the re-inspection narrative for one carried-over finding.
 *
 * This route DOES NOT WRITE. It reads the original finding (for context), the
 * re-inspection finding and the inspector's note, and returns text. Saving is a
 * separate call to PATCH /api/inspections/reinspection, which goes through the
 * re-inspection guard. Keeping generation and persistence apart is what makes
 * "AI must never update the original finding" a property of the architecture
 * rather than a promise in a prompt: there is no code path from here to a write
 * of any kind, on the original or anywhere else.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const findingId = Number(body?.findingId);
    if (!Number.isFinite(findingId)) {
      return NextResponse.json({ error: "Missing finding id." }, { status: 400 });
    }

    const db = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: finding } = await db
      .from("findings")
      .select("id, inspection_id, title, section, severity, reinspection_status, reinspection_note, source_finding_id")
      .eq("id", findingId)
      .maybeSingle();
    if (!finding?.id) {
      return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    }

    // Refuse to draft against an original finding at all. Nothing here writes,
    // but returning "re-inspection text" for a historical finding invites a
    // caller to save it somewhere it does not belong.
    await assertIsReinspection(db, finding.inspection_id);

    const { data: inspection } = await db
      .from("inspections")
      .select("id, inspector_id, company_id")
      .eq("id", finding.inspection_id)
      .maybeSingle();
    const ownsIt =
      String(inspection?.inspector_id || "") === user.id ||
      (inspection?.company_id
        ? Boolean(
            (
              await db
                .from("company_users")
                .select("company_id")
                .eq("user_id", user.id)
                .eq("company_id", inspection.company_id)
                .maybeSingle()
            ).data,
          )
        : false);
    if (!ownsIt) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    let original: any = null;
    if (finding.source_finding_id) {
      const { data } = await db
        .from("findings")
        .select("title, observation, implication, recommendation, severity, section")
        .eq("id", finding.source_finding_id)
        .maybeSingle();
      original = data;
    }

    const note = String(body?.note ?? finding.reinspection_note ?? "").trim();
    const verdict = String(body?.status ?? finding.reinspection_status ?? "not_evaluated");
    if (!note) {
      return NextResponse.json({ error: "Add a note about what you observed." }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a home inspection report writer documenting a LIMITED REPAIR RE-INSPECTION. " +
            "You are describing what the inspector observed on the RETURN visit only. " +
            "Never restate the original finding as if it were new, never contradict or " +
            "revise the original inspector's wording, and never suggest the original " +
            "report was wrong. The original is a historical record. Return ONLY JSON.",
        },
        {
          role: "user",
          content: `
ORIGINAL FINDING (context only - do not rewrite):
Title: ${original?.title ?? finding.title ?? ""}
Observation: ${original?.observation ?? ""}
Implication: ${original?.implication ?? ""}
Recommendation: ${original?.recommendation ?? ""}
Section: ${original?.section ?? finding.section ?? ""}
Severity: ${original?.severity ?? finding.severity ?? ""}

RE-INSPECTION VERDICT: ${verdict}
INSPECTOR NOTE FROM THE RETURN VISIT:
${note}

Write the re-inspection narrative for this one item: what was observed on the
return visit, and whether the original condition was addressed. Two to four
sentences, plain professional language, no headings.

Return JSON:
{ "summary": "" }
`,
        },
      ],
      temperature: 0.4,
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    return NextResponse.json({ summary: String(parsed?.summary || "").trim() });
  } catch (err: any) {
    if (err instanceof OriginalReportWriteError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("AI REINSPECTION DRAFT ERROR:", err);
    const serviceError = classifyAIServiceError(err);
    return NextResponse.json(
      {
        error: serviceError.message,
        code: serviceError.code,
        retryable: serviceError.retryable,
        retryAfterSeconds: serviceError.retryAfterSeconds,
      },
      { status: serviceError.status },
    );
  }
}

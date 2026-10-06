import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";
import { openai, getFastAIModel, getAIVersion, requireOpenAIKey } from "../../../../lib/openai";
import { logAIEvent } from "../../../../lib/logging";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { CHECKLIST_LIBRARY } from "../../../../lib/checklistLibrary";
import { writeChecklistFills, type ChecklistFill } from "../../../../lib/ai/checklistAutofill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getAdminClient();

function cleanText(value: any) {
  return String(value || "").trim();
}
function normKey(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Compact vocabulary of every section-info field + its allowed options, so the
// model knows exactly which checkboxes exist and what they can be set to.
function buildVocab() {
  const lines: string[] = [];
  for (const [section, groups] of Object.entries(CHECKLIST_LIBRARY)) {
    if (section === "Inspection Details") continue; // attendance/weather, not spoken field data
    for (const g of groups as any[]) {
      if (g.type === "text") {
        lines.push(`${section} > ${g.title}: <number or short text>`);
      } else if (Array.isArray(g.options) && g.options.length) {
        lines.push(`${section} > ${g.title}: [${g.options.join(", ")}]`);
      }
    }
  }
  return lines.join("\n");
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
    const transcript = cleanText(body.transcript).slice(0, 4000);

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }
    if (!transcript) {
      return NextResponse.json({ error: "Nothing was heard — try again." }, { status: 400 });
    }

    const inspection = await authorizeInspection(supabaseAdmin, user.id, inspectionId, "id");
    if (!inspection) return notFound("Inspection not found.");

    const systemPrompt = `You convert a home inspector's SPOKEN notes into section-info checklist selections.

You are given the checklist as "Section > Field: [allowed options]" (or "<number or short text>" for free fields). For each thing the inspector clearly states, output which field it fills and the value, inferring the section from the content. Examples:
- "asphalt shingles" -> Roof > Roof Covering Material -> "Asphalt"
- "water shut off in the basement" -> Plumbing > Main Water Shutoff Location -> "Basement"
- "200 amp panel" / "two hundred amp" -> Electrical > Panel Capacity -> "200 AMP"
- "double hung windows" -> Doors, Windows & Interior > Window Type -> "Double-hung"
- "copper supply lines" -> Plumbing > Water Supply Material -> "Copper"

Rules:
- Choose the single best-matching ALLOWED option for each field. For a <number or short text> field, output the spoken value (e.g. "12" for insulation depth).
- Only include fields the inspector CLEARLY stated. Never invent. If unsure which field or value, omit it.
- One utterance can set several fields; output all of them.
- Return ONLY valid JSON: { "fills": [ { "section": "", "field": "", "value": "" } ] }.`;

    const userPrompt = `Checklist (Section > Field: options):
${buildVocab()}

Inspector said:
"""
${transcript}
"""

Return the JSON fills now.`;

    // Fast model: this is constrained slot-filling (map spoken words to a fixed
    // checklist option list), re-validated server-side against CHECKLIST_LIBRARY
    // below — not prose generation — so the fast model is equivalent here and
    // noticeably quicker. (Writer wording lives in ai-capture, left untouched.)
    const model = getFastAIModel();
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
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
        tool: "voice_section_fill",
        status: "failed",
        response: { code: svc.code, error: svc.technicalMessage || svc.message },
      });
      return NextResponse.json(
        { error: svc.message, code: svc.code, retryable: svc.retryable },
        { status: svc.status },
      );
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    // Resolve each proposed fill against the real checklist.
    const proposed: ChecklistFill[] = [];
    for (const item of Array.isArray(parsed?.fills) ? parsed.fills : []) {
      const section = cleanText(item?.section);
      const field = cleanText(item?.field || item?.group);
      const value = cleanText(item?.value);
      if (!section || !field || !value) continue;
      const groups = (CHECKLIST_LIBRARY as any)[section];
      if (!groups) continue;
      const group = groups.find((g: any) => normKey(g.title) === normKey(field));
      if (!group) continue;

      if (group.type === "text") {
        const num = value.match(/\d+(?:\.\d+)?/)?.[0] || value;
        proposed.push({ section, groupTitle: group.title, kind: "text", value: num, matched: false });
      } else {
        const matchedOpt = (group.options || []).find((o: string) => normKey(o) === normKey(value));
        proposed.push({
          section,
          groupTitle: group.title,
          kind: "option",
          value: matchedOpt || value,
          matched: Boolean(matchedOpt),
        });
      }
    }

    // Only fill EMPTY groups — never overlap what a photo already recognized or
    // the inspector already set. Build the applied list for the UI's confirmation.
    const applied: Array<{ section: string; group: string; value: string }> = [];
    const toWrite: ChecklistFill[] = [];
    const seen = new Set<string>();
    for (const fill of proposed) {
      const key = `${fill.section}::${fill.groupTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { data: existing } = await supabaseAdmin
        .from("section_checklist_selections")
        .select("id")
        .eq("inspection_id", inspectionId)
        .eq("section", fill.section)
        .eq("group_title", fill.groupTitle)
        .limit(1);
      if (existing && existing.length > 0) continue; // already set — skip (no overlap)

      toWrite.push(fill);
      applied.push({ section: fill.section, group: fill.groupTitle, value: fill.value });
    }

    // Stamp inspector_id = the acting inspector. This is a SERVICE-ROLE client,
    // so without it the rows save with inspector_id = null and the RLS'd builder
    // read (keyed on inspector_id) can't see them — the boxes show unchecked even
    // though they saved. user.id matches what a manual checkbox insert records.
    const written = toWrite.length
      ? await writeChecklistFills(supabaseAdmin, inspectionId, toWrite, { inspectorId: user.id })
      : 0;

    await logAIEvent({
      userId,
      inspectionId,
      tool: "voice_section_fill",
      prompt: "Voice section fill",
      response: { proposed: proposed.length, applied: applied.length, written },
      tokensUsed: completion.usage?.total_tokens ?? null,
      status: "success",
      model,
      aiVersion: getAIVersion("voice-section-fill"),
    });

    return NextResponse.json({ success: true, written, applied });
  } catch (error: any) {
    const svc = classifyAIServiceError(error);
    return NextResponse.json(
      { error: svc.message || error?.message || "Voice fill failed." },
      { status: svc.status || 500 },
    );
  }
}

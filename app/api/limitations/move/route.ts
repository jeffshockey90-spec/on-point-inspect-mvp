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

// Move an inspection limitation to a DIFFERENT report section. The section is
// always updated; when the limitation carries custom wording (an AI or custom
// limitation, not just a standard checkbox), the wording AND its title are
// AI-adjusted to read correctly under the new section (keeping the same facts,
// swapping section-specific references). A plain standard limitation just moves.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const limitationId = clean(body?.limitationId || body?.limitation_id);
    const newSection = clean(body?.newSection || body?.section);

    if (!inspectionId || !limitationId || !newSection) {
      return NextResponse.json(
        { error: "Missing inspectionId, limitationId, or newSection." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const { data: limitation, error: loadError } = await admin
      .from("section_limitations")
      .select("*")
      .eq("id", limitationId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!limitation) {
      return NextResponse.json({ error: "Limitation not found." }, { status: 404 });
    }

    const oldSection = clean(limitation.section);
    if (oldSection === newSection) {
      return NextResponse.json({ ok: true, limitation });
    }

    const wording = clean(limitation.limitation_comment) || clean(limitation.custom_text);
    const label = clean(limitation.label);
    const isStandardLabel =
      !wording && label && label !== "Other" && label !== "AI Limitation Note";

    const update: Record<string, any> = { section: newSection };

    // Only rewrite when there's real wording to adjust. A standard checkbox
    // limitation ("Limited Access") is generic and just moves.
    if (wording && process.env.OPENAI_API_KEY && !isStandardLabel) {
      try {
        const writingConfig = await loadWritingConfigForInspection(inspectionId);
        const styleBlock = buildWritingStyleInstructions(writingConfig);

        const systemPrompt = `You adjust a home inspection LIMITATION so it reads correctly under a DIFFERENT report section. Keep the same meaning and every fact — only update section-specific references (the component/area named) so the limitation fits the new section. Do not invent, exaggerate, or drop anything. Keep it professional and liability-safe.

${styleBlock}

Return ONLY valid JSON: {"title":"","comment":""} — "title" is a short 2–5 word label for the limitation; "comment" is the full limitation wording.`;

        const userPrompt = `Moving FROM section "${oldSection || "?"}" TO section "${newSection}".
Current title: ${label}
Current limitation wording: ${wording}

Rewrite it to fit the "${newSection}" section.`;

        const aiResponse = await openai.chat.completions.create({
          model: getAIModel(),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
        });

        let parsed: any = {};
        try {
          parsed = JSON.parse(aiResponse.choices[0]?.message?.content || "{}");
        } catch {
          parsed = {};
        }

        const newComment = clean(parsed.comment);
        const newTitle = clean(parsed.title);

        if (newComment) {
          // Write back into whichever field held the wording.
          if (clean(limitation.limitation_comment)) update.limitation_comment = newComment;
          else update.custom_text = newComment;
        }
        // Only replace a generic/placeholder label — never a title the inspector
        // chose (a saved-template title). "Other"/"AI Limitation Note" are generic.
        if (newTitle && (label === "Other" || label === "AI Limitation Note")) {
          update.label = newTitle;
        }
      } catch (aiErr) {
        // Rewrite is best-effort — the move still happens with the original text.
        console.error("Limitation move rewrite failed:", aiErr);
      }
    }

    const { data: updated, error: updateError } = await admin
      .from("section_limitations")
      .update(update)
      .eq("id", limitationId)
      .eq("inspection_id", inspectionId)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, limitation: updated });
  } catch (error: any) {
    console.error("Limitation move error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to move the limitation." },
      { status: 500 },
    );
  }
}

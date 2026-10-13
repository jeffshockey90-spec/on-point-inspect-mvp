import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getAdminClient();

function cleanText(value: any) {
  return String(value || "").trim();
}

// Quick-correct a single voice-filled checkbox when the recognizer misheard:
// swap one option for another within the same (section, group). Deletes the
// old value row and writes the new one, stamping inspector_id = the acting
// inspector (service-role client, same as voice-section-fill — otherwise the
// RLS'd builder read keyed on inspector_id can't see it).
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id;
    const section = cleanText(body.section);
    const groupTitle = cleanText(body.groupTitle || body.group);
    const oldValue = cleanText(body.oldValue);
    const newValue = cleanText(body.newValue);

    if (!inspectionId || !section || !groupTitle || !newValue) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }

    const inspection = await authorizeInspection(supabaseAdmin, user.id, inspectionId, "id");
    if (!inspection) return notFound("Inspection not found.");

    if (newValue === oldValue) {
      return NextResponse.json({ success: true, value: newValue });
    }

    // Remove the previously-filled value for this exact box (if any).
    if (oldValue) {
      await supabaseAdmin
        .from("section_checklist_selections")
        .delete()
        .eq("inspection_id", inspectionId)
        .eq("section", section)
        .eq("group_title", groupTitle)
        .eq("value", oldValue);
    }

    // Don't create a duplicate if the new value is already checked.
    const { data: existing } = await supabaseAdmin
      .from("section_checklist_selections")
      .select("id")
      .eq("inspection_id", inspectionId)
      .eq("section", section)
      .eq("group_title", groupTitle)
      .eq("value", newValue)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error } = await supabaseAdmin
        .from("section_checklist_selections")
        .insert({
          inspection_id: inspectionId,
          section,
          group_title: groupTitle,
          value: newValue,
          inspector_id: user.id,
        });
      if (error) {
        return NextResponse.json(
          { error: error.message || "Could not update the selection." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true, value: newValue });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Correction failed." },
      { status: 500 },
    );
  }
}

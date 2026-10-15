import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";
import { generateLimitationNote } from "../../../../lib/ai/limitationNote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live-camera voice command: the inspector casually says "add limitation for
// older electrical" → the spoken note is turned into a cautious title + wording
// and saved as a limitation on the current section, hands-free. Mirrors the
// builder's "+ Add a limitation" box, just driven by speech.
//
// POST { inspectionId, section, note }
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id;
    const section = String(body.section || "").trim();
    const note = String(body.note || body.notes || "").trim();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection." }, { status: 400 });
    }
    if (!note) {
      return NextResponse.json({ error: "Nothing to add — say what the limitation is." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound("Inspection not found.");

    const { title, comment } = await generateLimitationNote({ section, notes: note });

    const { data, error } = await admin
      .from("section_limitations")
      .insert({
        inspection_id: inspectionId,
        section: section || "Inspection Details",
        label: title,
        limitation_comment: comment,
        ai_notes: note,
        custom_text: null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not save the limitation." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, limitation: data, title, comment });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not add the limitation." },
      { status: 500 },
    );
  }
}

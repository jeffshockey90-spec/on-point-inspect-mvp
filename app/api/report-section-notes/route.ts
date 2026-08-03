import { NextResponse } from "next/server";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: any) {
  return String(value ?? "").trim();
}

// GET ?inspectionId= -> all section notes for the inspection (owner/team only).
// Used by the report builder to load existing notes for editing.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const inspectionId = cleanText(new URL(req.url).searchParams.get("inspectionId"));
  if (!inspectionId) return notFound();

  const admin = getAdminClient();
  const inspection = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!inspection) return notFound();

  const { data, error } = await admin
    .from("report_section_notes")
    .select("section_name, notes")
    .eq("inspection_id", inspection.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data || [] });
}

// POST { inspectionId, sectionName, notes } -> upsert a section's note. An empty
// note deletes the row. Owner/team only.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const payload = await req.json().catch(() => ({}));
  const inspectionId = cleanText(payload.inspectionId || payload.inspection_id);
  const sectionName = cleanText(payload.sectionName || payload.section_name);
  const notes = typeof payload.notes === "string" ? payload.notes : "";

  if (!inspectionId) return notFound();
  if (!sectionName) {
    return NextResponse.json({ error: "sectionName is required." }, { status: 400 });
  }

  const admin = getAdminClient();
  const inspection = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!inspection) return notFound();

  // An empty note removes the row so it doesn't render an empty block.
  if (!notes.trim()) {
    const { error } = await admin
      .from("report_section_notes")
      .delete()
      .eq("inspection_id", inspection.id)
      .eq("section_name", sectionName);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, notes: "" });
  }

  const { error } = await admin.from("report_section_notes").upsert(
    {
      inspection_id: inspection.id,
      section_name: sectionName,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "inspection_id,section_name" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notes });
}

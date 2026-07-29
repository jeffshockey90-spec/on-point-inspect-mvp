import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const inspectionId = Number(body.inspectionId);
  const sectionName = String(body.sectionName || "").trim();
  const notes = String(body.notes || "");

  if (!inspectionId || !sectionName) {
    return NextResponse.json({ error: "Missing section." }, { status: 400 });
  }

  const { data: inspection } = await supabase
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq("inspector_id", user.id)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  }

  const { error } = await supabase.from("report_section_notes").upsert(
    {
      inspection_id: inspectionId,
      section_name: sectionName,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "inspection_id,section_name" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

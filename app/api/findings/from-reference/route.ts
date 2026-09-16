import { NextResponse } from "next/server";
import {
  getSessionUser,
  getAdminClient,
  authorizeInspection,
  unauthorized,
  notFound,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/findings/from-reference  { referencePhotoId, title?, severity? }
//
// Promote a section reference photo into a real finding/defect — for when a
// photo got captured as a reference but is actually a defect. Creates a finding
// in the same section, re-attaches the SAME image file to it (no re-upload),
// and removes the reference-photo row (the storage file stays — it's now the
// finding's photo). The report builder picks up the new finding via realtime.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const referencePhotoId = String(
      body.referencePhotoId || body.reference_photo_id || "",
    ).trim();
    if (!referencePhotoId) {
      return NextResponse.json({ error: "Missing reference photo id." }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data: ref, error: refErr } = await admin
      .from("section_reference_photos")
      .select("*")
      .eq("id", referencePhotoId)
      .maybeSingle();
    if (refErr || !ref) return notFound("Reference photo not found.");

    const inspectionId = ref.inspection_id;
    const authorized = await authorizeInspection(admin, user.id, inspectionId);
    if (!authorized) return notFound("Inspection not found.");

    const { data: inspection } = await admin
      .from("inspections")
      .select("id, company_id")
      .eq("id", inspectionId)
      .maybeSingle();

    const title = String(body.title || ref.caption || "Defect (from reference photo)").slice(0, 200);
    const severity = String(body.severity || "Maintenance").slice(0, 60);

    // Create the finding in the same section. findings has company_id (for
    // company scoping) but NO inspector_id column — matches how the AI organizer
    // inserts findings.
    const { data: finding, error: findErr } = await admin
      .from("findings")
      .insert({
        inspection_id: inspectionId,
        company_id: inspection?.company_id || null,
        section: ref.section,
        title,
        severity,
        observation: "",
        implication: "",
        recommendation: "",
        image_url: ref.public_url || null,
      })
      .select("id")
      .maybeSingle();
    if (findErr || !finding) {
      return NextResponse.json(
        { error: findErr?.message || "Could not create the finding." },
        { status: 500 },
      );
    }

    // Re-attach the SAME image file to the new finding (no re-upload).
    const { error: photoErr } = await admin.from("photos").insert({
      inspection_id: inspectionId,
      finding_id: finding.id,
      public_url: ref.public_url || null,
      file_path: ref.file_path || null,
      is_video: false,
      thumbnail_url: ref.thumbnail_url || null,
      thumbnail_path: ref.thumbnail_path || null,
    });
    if (photoErr) {
      // Roll back the finding so we don't leave an empty one behind.
      await admin.from("findings").delete().eq("id", finding.id);
      return NextResponse.json({ error: photoErr.message }, { status: 500 });
    }

    // Drop the reference-photo row, but KEEP the storage file (now the finding's
    // photo). Never remove the file here.
    await admin
      .from("section_reference_photos")
      .delete()
      .eq("id", referencePhotoId);

    return NextResponse.json({ ok: true, findingId: finding.id, section: ref.section });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to convert reference photo." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "inspection-photos";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

function cleanText(value: any) {
  return String(value || "").trim();
}

function parseDataUrl(dataUrl: string) {
  const clean = cleanText(dataUrl);
  if (!clean) throw new Error("No camera image was received.");

  const match = clean.match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error("Invalid camera image data.");

  const mimeType = match[1] || "image/jpeg";
  const buffer = Buffer.from(match[2] || "", "base64");
  if (!buffer.length) throw new Error("Camera image was empty.");

  return {
    buffer,
    mimeType,
    extension: mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : "jpg",
  };
}

export async function POST(req: Request) {
  let savedLimitation: any = null;
  let uploadedFilePath = "";

  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();

    const inspectionId = cleanText(body.inspectionId);
    const section = cleanText(body.section);
    const title = cleanText(body.title) || "AI Limitation Note";
    const limitation = cleanText(body.limitation);
    const reason = cleanText(body.reason);
    const recommendation = cleanText(body.recommendation);
    const imageDataUrl = cleanText(body.imageDataUrl);

    if (!inspectionId) return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });

    const inspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");
    if (!section) return NextResponse.json({ error: "Missing section." }, { status: 400 });
    if (!limitation) return NextResponse.json({ error: "Missing limitation text." }, { status: 400 });

    const { data: inspectionRow, error: inspectionError } = await supabase
      .from("inspections")
      .select("inspector_id")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspectionRow?.inspector_id) {
      return NextResponse.json(
        { error: "Could not verify inspection owner." },
        { status: 500 },
      );
    }

    const inspectorId = inspectionRow.inspector_id;
    const parsedImage = parseDataUrl(imageDataUrl);

    const limitationComment = [
      limitation,
      reason ? `Reason: ${reason}` : "",
      recommendation ? `Recommendation: ${recommendation}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: insertedLimitation, error: limitationError } = await supabase
      .from("section_limitations")
      .insert({
        inspection_id: inspectionId,
        inspector_id: inspectorId,
        section,
        label: title,
        ai_notes: reason || limitation,
        limitation_comment: limitationComment,
        custom_text: null,
      })
      .select("*")
      .single();

    if (limitationError) {
      return NextResponse.json(
        { error: limitationError.message || "Failed to save limitation." },
        { status: 500 },
      );
    }

    savedLimitation = insertedLimitation;

    uploadedFilePath = `${inspectionId}/limitations/${savedLimitation.id}/${Date.now()}-ai-live.${parsedImage.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(uploadedFilePath, parsedImage.buffer, {
        contentType: parsedImage.mimeType,
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message || "Photo upload failed.");

    const { data: publicData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(uploadedFilePath);

    const { data: photoRow, error: photoError } = await supabase
      .from("limitation_photos")
      .insert({
        limitation_id: savedLimitation.id,
        inspector_id: inspectorId,
        photo_url: publicData.publicUrl,
        thumbnail_url: publicData.publicUrl,
        thumbnail_path: uploadedFilePath,
      })
      .select("*")
      .single();

    if (photoError) throw new Error(photoError.message || "Photo record insert failed.");

    return NextResponse.json({
      success: true,
      limitation: savedLimitation,
      limitationId: savedLimitation?.id || null,
      photo: photoRow,
      photoId: photoRow?.id || null,
    });
  } catch (error: any) {
    if (uploadedFilePath) {
      await supabase.storage.from(PHOTO_BUCKET).remove([uploadedFilePath]);
    }

    if (savedLimitation?.id) {
      await supabase.from("section_limitations").delete().eq("id", savedLimitation.id);
    }

    return NextResponse.json(
      { error: error?.message || "Failed to save AI limitation with photo." },
      { status: 500 },
    );
  }
}
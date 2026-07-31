import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

const VALID_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

function cleanText(value: any) {
  return String(value || "").trim();
}

function normalizeSeverity(value: any) {
  const clean = cleanText(value);
  return VALID_SEVERITIES.includes(clean) ? clean : "Recommended Repair";
}

function parseDataUrl(dataUrl: string) {
  const clean = cleanText(dataUrl);

  if (!clean) {
    throw new Error("No camera image was received.");
  }

  const match = clean.match(/^data:(.*?);base64,(.*)$/);

  if (!match) {
    throw new Error("Invalid camera image data.");
  }

  const mimeType = match[1] || "image/jpeg";
  const base64 = match[2] || "";
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Camera image was empty.");
  }

  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";

  return {
    buffer,
    mimeType,
    extension,
  };
}

export async function POST(req: Request) {
  let savedFinding: any = null;
  let uploadedFilePath = "";

  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();

    const inspectionId = cleanText(body.inspectionId);
    const section = cleanText(body.section) || "Inspection Details";
    const title = cleanText(body.title) || "AI Live Camera Finding";
    const severity = normalizeSeverity(body.severity);
    const observation = cleanText(body.observation);
    const implication = cleanText(body.implication);
    const recommendation = cleanText(body.recommendation);
    const imageDataUrl = cleanText(body.imageDataUrl);

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const inspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    if (!observation && !title) {
      return NextResponse.json(
        { error: "Missing finding title or observation." },
        { status: 400 },
      );
    }

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

    const { data: insertedFinding, error: findingError } = await supabase
      .from("findings")
      .insert({
        inspection_id: inspectionId,
        inspector_id: inspectorId,
        section,
        severity,
        title,
        observation,
        implication,
        recommendation,
        image_url: null,
      })
      .select("*")
      .single();

    if (findingError) {
      return NextResponse.json(
        {
          error: findingError.message || "Failed to save finding.",
          details: findingError,
        },
        { status: 500 },
      );
    }

    savedFinding = insertedFinding;

    uploadedFilePath = `${inspectionId}/finding-photos/${
      savedFinding.id
    }/${Date.now()}-ai-live.${parsedImage.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(uploadedFilePath, parsedImage.buffer, {
        contentType: parsedImage.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Photo upload failed.");
    }

    const { data: publicData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(uploadedFilePath);

    const { data: photoRow, error: photoError } = await supabase
      .from("photos")
      .insert({
        inspection_id: inspectionId,
        finding_id: savedFinding.id,
        file_path: uploadedFilePath,
        public_url: publicData.publicUrl,
        thumbnail_path: uploadedFilePath,
        thumbnail_url: publicData.publicUrl,
        is_video: false,
        mime_type: parsedImage.mimeType,
      })
      .select("*")
      .single();

    if (photoError) {
      throw new Error(photoError.message || "Photo record insert failed.");
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath(`/share/${inspectionId}`);
    revalidatePath(`/client-portal/${inspectionId}`);
    revalidatePath(`/reports/${inspectionId}/print`);

    return NextResponse.json({
      success: true,
      finding: savedFinding,
      findingId: savedFinding?.id || null,
      photo: photoRow,
      photoId: photoRow?.id || null,
    });
  } catch (error: any) {
    if (uploadedFilePath) {
      await supabase.storage.from(PHOTO_BUCKET).remove([uploadedFilePath]);
    }

    if (savedFinding?.id) {
      await supabase.from("findings").delete().eq("id", savedFinding.id);
    }

    console.error("AI live finding save error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to save AI live finding with photo.",
      },
      { status: 500 },
    );
  }
}

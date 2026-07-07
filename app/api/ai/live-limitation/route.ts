import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const extension =
    mimeType.includes("png")
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
  let savedLimitation: any = null;

  try {
    const body = await req.json();

    const inspectionId = cleanText(body.inspectionId);
    const section = cleanText(body.section);
    const title = cleanText(body.title) || "AI Limitation Note";
    const limitation = cleanText(body.limitation);
    const reason = cleanText(body.reason);
    const recommendation = cleanText(body.recommendation);
    const imageDataUrl = cleanText(body.imageDataUrl);

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    if (!section) {
      return NextResponse.json({ error: "Missing section." }, { status: 400 });
    }

    if (!limitation) {
      return NextResponse.json({ error: "Missing limitation text." }, { status: 400 });
    }

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
        {
          error: limitationError.message || "Failed to save limitation.",
          details: limitationError,
        },
        { status: 500 },
      );
    }

    savedLimitation = insertedLimitation;

    const filePath = `${inspectionId}/limitations/${
      savedLimitation.id
    }/${Date.now()}-ai-live.${parsedImage.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(filePath, parsedImage.buffer, {
        contentType: parsedImage.mimeType,
        upsert: true,
      });

    if (uploadError) {
      await supabase.from("section_limitations").delete().eq("id", savedLimitation.id);

      return NextResponse.json(
        {
          error: uploadError.message || "Photo upload failed.",
          photoError: uploadError.message || "Photo upload failed.",
          limitationRolledBack: true,
        },
        { status: 500 },
      );
    }

    const { data: publicData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(filePath);

    const { data: photoRow, error: photoError } = await supabase
      .from("limitation_photos")
      .insert({
        limitation_id: savedLimitation.id,
        inspection_id: inspectionId,
        section,
        file_path: filePath,
        public_url: publicData.publicUrl,
      })
      .select("*")
      .single();

    if (photoError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([filePath]);
      await supabase.from("section_limitations").delete().eq("id", savedLimitation.id);

      return NextResponse.json(
        {
          error: photoError.message || "Photo record insert failed.",
          photoError: photoError.message || "Photo record insert failed.",
          limitationRolledBack: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      limitation: savedLimitation,
      limitationId: savedLimitation?.id || null,
      photo: photoRow,
      photoId: photoRow?.id || null,
    });
  } catch (error: any) {
    if (savedLimitation?.id) {
      await supabase.from("section_limitations").delete().eq("id", savedLimitation.id);
    }

    console.error("AI live limitation save error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to save AI limitation with photo.",
      },
      { status: 500 },
    );
  }
}

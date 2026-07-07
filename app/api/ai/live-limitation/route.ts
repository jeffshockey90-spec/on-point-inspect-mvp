import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
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

function dataUrlToBuffer(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:(.*?);base64,(.*)$/);

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1] || "image/jpeg",
    buffer: Buffer.from(match[2] || "", "base64"),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = cleanText(body.inspectionId);
    const section = cleanText(body.section) || "Inspection Details";
    const title = cleanText(body.title) || "AI Limitation Note";
    const limitation = cleanText(body.limitation);
    const reason = cleanText(body.reason);
    const recommendation = cleanText(body.recommendation);
    const imageDataUrl = cleanText(body.imageDataUrl);

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 },
      );
    }

    if (!limitation) {
      return NextResponse.json(
        { error: "Missing limitation text." },
        { status: 400 },
      );
    }

    const limitationComment = [
      limitation,
      reason ? `Reason: ${reason}` : "",
      recommendation ? `Recommendation: ${recommendation}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: savedLimitation, error: limitationError } = await supabaseAdmin
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
      throw limitationError;
    }

    let savedPhoto: any = null;
    const image = dataUrlToBuffer(imageDataUrl);

    if (image?.buffer?.length && savedLimitation?.id) {
      const extension = image.mimeType.includes("png") ? "png" : "jpg";
      const filePath = `${inspectionId}/limitations/${savedLimitation.id}/${Date.now()}-ai-live.${extension}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("inspection-photos")
        .upload(filePath, image.buffer, {
          contentType: image.mimeType || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Limitation saved, but photo upload failed: ${uploadError.message}`);
      }

      const { data: publicData } = supabaseAdmin.storage
        .from("inspection-photos")
        .getPublicUrl(filePath);

      const { data: photoRow, error: photoError } = await supabaseAdmin
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
        throw new Error(`Limitation saved, but photo record failed: ${photoError.message}`);
      }

      savedPhoto = photoRow;
    }

    return NextResponse.json({
      success: true,
      limitation: savedLimitation,
      photo: savedPhoto,
    });
  } catch (error: any) {
    console.error("AI live limitation save error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to save AI limitation.",
      },
      { status: 500 },
    );
  }
}

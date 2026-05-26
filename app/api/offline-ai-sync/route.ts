import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function base64ToBuffer(base64: string) {
  const cleanBase64 = base64.includes(",")
    ? base64.split(",")[1]
    : base64;

  return Buffer.from(cleanBase64, "base64");
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .toLowerCase();
}

export async function POST(req: Request) {
  try {
    const item = await req.json();

    if (!item?.type) {
      return NextResponse.json(
        { error: "Missing offline queue item type." },
        { status: 400 }
      );
    }

    if (item.type === "finding") {
      const payload = item.payload || {};

      if (!payload.inspection_id) {
        return NextResponse.json(
          { error: "Missing inspection_id." },
          { status: 400 }
        );
      }

      if (!payload.title) {
        return NextResponse.json(
          { error: "Missing finding title." },
          { status: 400 }
        );
      }

      const offlinePhotos = Array.isArray(payload.photos)
        ? payload.photos
        : [];

      let firstImageUrl: string | null = null;

      const { data: finding, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: payload.inspection_id,
          title: payload.title,
          section: payload.section || "Exterior",
          severity:
            payload.severity ||
            "Recommended Repair",
          observation: payload.observation || "",
          implication: payload.implication || "",
          recommendation:
            payload.recommendation || "",
          image_url: null,
        })
        .select()
        .single();

      if (error) throw error;

      for (const photo of offlinePhotos) {
        if (!photo?.base64) continue;

        const fileName = sanitizeFileName(
          photo.name || "offline-photo.jpg"
        );

        const filePath = `${
          payload.inspection_id
        }/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}-${fileName}`;

        const buffer = base64ToBuffer(photo.base64);

        const { error: uploadError } =
          await supabase.storage
            .from("inspection-photos")
            .upload(filePath, buffer, {
              contentType:
                photo.type || "image/jpeg",
              upsert: false,
            });

        if (uploadError) throw uploadError;

        const { data: publicData } =
          supabase.storage
            .from("inspection-photos")
            .getPublicUrl(filePath);

        const publicUrl =
          publicData.publicUrl || null;

        if (!firstImageUrl) {
          firstImageUrl = publicUrl;
        }

        const { error: photoError } =
          await supabase.from("photos").insert({
            inspection_id:
              payload.inspection_id,
            finding_id: finding.id,
            public_url: publicUrl,
            file_path: filePath,
          });

        if (photoError) throw photoError;
      }

      if (firstImageUrl) {
        await supabase
          .from("findings")
          .update({
            image_url: firstImageUrl,
          })
          .eq("id", finding.id);
      }

      return NextResponse.json({
        ok: true,
        synced: true,
        type: "finding",
        finding_id: finding.id,
        photo_count: offlinePhotos.length,
      });
    }

    return NextResponse.json(
      {
        error: `Unsupported offline item type: ${item.type}`,
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Offline sync error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to sync offline item.",
      },
      { status: 500 }
    );
  }
}

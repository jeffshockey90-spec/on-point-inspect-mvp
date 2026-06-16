import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "inspection-photos";
const MAX_PHOTOS_PER_ITEM = 6;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function base64ToBuffer(base64: string) {
  const cleanBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
  return Buffer.from(cleanBase64, "base64");
}

function sanitizeFileName(name: string) {
  return String(name || "offline-photo.jpg")
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

function safeSection(section: string) {
  return String(section || "Exterior")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function fallbackTitle(payload: any) {
  return (
    String(payload?.title || "").trim() ||
    String(payload?.inspector_note || payload?.note || "").trim().slice(0, 80) ||
    "Offline Field Note"
  );
}

async function uploadOfflinePhoto({
  inspectionId,
  photo,
  folder = "offline",
}: {
  inspectionId: string;
  photo: any;
  folder?: string;
}) {
  if (!photo?.base64) return null;

  const fileName = sanitizeFileName(photo.name || "offline-photo.jpg");
  const filePath = `${inspectionId}/${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${fileName}`;

  const buffer = base64ToBuffer(photo.base64);

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, buffer, {
      contentType: photo.type || "image/jpeg",
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(filePath);

  return {
    filePath,
    publicUrl: publicData.publicUrl || null,
  };
}

export async function POST(req: Request) {
  try {
    const item = await req.json().catch(() => ({}));

    if (!item?.type) {
      return NextResponse.json({ error: "Missing offline queue item type." }, { status: 400 });
    }

    const payload = item.payload || {};
    const inspectionId = String(payload.inspection_id || "").trim();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection_id." }, { status: 400 });
    }

    const offlinePhotos = Array.isArray(payload.photos)
      ? payload.photos.slice(0, MAX_PHOTOS_PER_ITEM)
      : [];

    if (item.type === "reference_photo") {
      if (offlinePhotos.length === 0) {
        return NextResponse.json({ error: "Reference photo sync requires at least one photo." }, { status: 400 });
      }

      let saved = 0;
      const section = payload.section || "Exterior";
      const caption =
        String(payload.caption || payload.inspector_note || payload.note || payload.title || "").trim() ||
        null;

      for (const photo of offlinePhotos) {
        const upload = await uploadOfflinePhoto({
          inspectionId,
          photo,
          folder: `reference-photos/${safeSection(section)}`,
        });

        if (!upload) continue;

        const { error } = await supabase.from("section_reference_photos").insert({
          inspection_id: inspectionId,
          section,
          caption,
          file_path: upload.filePath,
          public_url: upload.publicUrl,
        });

        if (error) throw error;
        saved += 1;
      }

      return NextResponse.json({
        ok: true,
        synced: true,
        type: "reference_photo",
        photo_count: saved,
      });
    }

    if (item.type === "finding") {
      const title = fallbackTitle(payload);

      const inspectorNote = String(payload.inspector_note || payload.note || "").trim();
      const observation =
        String(payload.observation || "").trim() ||
        (inspectorNote ? `Inspector field note: ${inspectorNote}` : "");

      const { data: finding, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title,
          section: payload.section || "Exterior",
          severity: payload.severity || "Recommended Repair",
          observation,
          implication: payload.implication || "",
          recommendation: payload.recommendation || "",
          image_url: null,
        })
        .select()
        .single();

      if (error) throw error;

      let firstImageUrl: string | null = null;
      let photoCount = 0;

      for (const photo of offlinePhotos) {
        const upload = await uploadOfflinePhoto({
          inspectionId,
          photo,
          folder: "offline-findings",
        });

        if (!upload) continue;

        if (!firstImageUrl) firstImageUrl = upload.publicUrl;

        const { error: photoError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          finding_id: finding.id,
          public_url: upload.publicUrl,
          file_path: upload.filePath,
        });

        if (photoError) throw photoError;
        photoCount += 1;
      }

      if (firstImageUrl) {
        await supabase.from("findings").update({ image_url: firstImageUrl }).eq("id", finding.id);
      }

      return NextResponse.json({
        ok: true,
        synced: true,
        type: "finding",
        finding_id: finding.id,
        photo_count: photoCount,
      });
    }

    return NextResponse.json({ error: `Unsupported offline item type: ${item.type}` }, { status: 400 });
  } catch (error: any) {
    console.error("Offline sync error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to sync offline item." },
      { status: 500 }
    );
  }
}

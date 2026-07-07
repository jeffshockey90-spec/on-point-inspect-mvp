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

function cleanId(value: any) {
  return String(value || "").trim();
}

function getStoragePath(photo: any) {
  return String(
    photo?.file_path || photo?.thumbnail_path || photo?.storage_path || "",
  ).trim();
}

function getFallbackUrl(photo: any) {
  return String(
    photo?.signed_url ||
      photo?.public_url ||
      photo?.photo_url ||
      photo?.thumbnail_url ||
      "",
  ).trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const limitationIds = Array.from(
      new Set((Array.isArray(body?.limitationIds) ? body.limitationIds : []).map(cleanId).filter(Boolean)),
    );

    if (limitationIds.length === 0) {
      return NextResponse.json({ photos: [] });
    }

    const { data, error } = await supabase
      .from("limitation_photos")
      .select("*")
      .in("limitation_id", limitationIds)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load limitation photos." },
        { status: 500 },
      );
    }

    const rows = data || [];
    const paths = Array.from(new Set(rows.map(getStoragePath).filter(Boolean)));
    const signedByPath: Record<string, string> = {};

    if (paths.length > 0) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, 60 * 60 * 24 * 7);

      if (!signedError) {
        (signedData || []).forEach((item: any, index: number) => {
          const path = item?.path || paths[index];
          if (path && item?.signedUrl) {
            signedByPath[path] = item.signedUrl;
          }
        });
      }
    }

    const photos = rows.map((photo: any) => {
      const storagePath = getStoragePath(photo);
      const fallbackUrl = getFallbackUrl(photo);

      return {
        ...photo,
        file_path: storagePath,
        public_url: fallbackUrl,
        signed_url: signedByPath[storagePath] || fallbackUrl,
      };
    });

    return NextResponse.json({ photos });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load limitation photos." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { extractVideoPosterJpeg } from "../../../../lib/videoPoster";
import { isCronAuthorized } from "../../../../lib/cronAuth";
import { verifyInternal } from "../../../../lib/internalSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "inspection-photos";

// Any video whose poster frame never got captured (offline-synced videos save
// thumbnail_path: null, older uploads predate client thumbnailing, or the client
// capture timed out) shows a blank placeholder in the report PDF. This job pulls
// a frame server-side with ffmpeg and stores it as the video's poster, so the
// PDF/print/portal all show a real still. Runs nightly; safe to hit manually.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return isCronAuthorized(req); // no secret: only Vercel's scheduler (lib/cronAuth)
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  // One-inspection mode: the report PDF calls this (signed, short-lived) right
  // before building, so a video synced today gets its poster in today's PDF
  // instead of waiting for the nightly run.
  const inspectionId = String(params.get("inspection") || "").trim();
  const forInspection =
    Boolean(inspectionId) && verifyInternal("video-posters", inspectionId, params.get("exp"), params.get("sig"));
  if (!forInspection && !authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Bound the work per run so the job always finishes inside maxDuration; the
  // next run picks up any remainder.
  const limit = Math.min(
    40,
    Math.max(1, Number(params.get("limit")) || 20),
  );

  try {
    let query = admin
      .from("photos")
      .select("id, file_path, thumbnail_path, thumbnail_url")
      .eq("is_video", true)
      .is("thumbnail_path", null)
      .is("thumbnail_url", null)
      .not("file_path", "is", null);
    if (forInspection) query = query.eq("inspection_id", inspectionId);
    // Newest first: with no order, the same old videos that ffmpeg can't read
    // came back first every night and could use up the whole batch, so new
    // videos never got a poster.
    const { data: vids, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    let ok = 0;
    let failed = 0;
    for (const v of vids || []) {
      try {
        const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(v.file_path);
        if (dlErr || !file) { failed++; continue; }
        const jpg = await extractVideoPosterJpeg(Buffer.from(await file.arrayBuffer()));
        if (!jpg) { failed++; continue; }

        const thumbPath = `${v.file_path}.thumb.jpg`;
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(thumbPath, jpg, { contentType: "image/jpeg", upsert: true });
        if (upErr) { failed++; continue; }

        const { error: updErr } = await admin
          .from("photos")
          .update({ thumbnail_path: thumbPath })
          .eq("id", v.id);
        if (updErr) { failed++; continue; }
        ok++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ ok: true, scanned: (vids || []).length, posters: ok, failed });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Poster backfill failed." },
      { status: 500 },
    );
  }
}

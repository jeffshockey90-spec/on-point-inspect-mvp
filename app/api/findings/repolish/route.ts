import { NextResponse } from "next/server";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "inspection-photos";

function cleanText(value: any) {
  return String(value ?? "").trim();
}

// Pull the finding's first still image (skip videos) and return it as a
// data: URL so it can be handed to the AI writer as supporting evidence, exactly
// like the field capture tool does. Best-effort: any failure just means we
// re-polish from the note alone.
async function loadFirstPhotoDataUrl(admin: any, findingId: string, inspectionId: string) {
  try {
    const { data: photos } = await admin
      .from("photos")
      .select("public_url, file_path, storage_path, is_video, mime_type")
      .eq("finding_id", findingId)
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true })
      .limit(10);

    const image = (photos || []).find((photo: any) => {
      const mime = String(photo?.mime_type || "").toLowerCase();
      const isVideo =
        Boolean(photo?.is_video) || mime.startsWith("video/");
      return !isVideo;
    });

    if (!image) return null;

    const filePath = image.file_path || image.storage_path || "";
    let url = image.public_url || "";

    // Prefer a fresh signed URL when we have a storage path (bucket may be private).
    if (filePath) {
      const { data: signed } = await admin.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(String(filePath), 60 * 5);
      if (signed?.signedUrl) url = signed.signedUrl;
    }

    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    const contentType = String(
      image.mime_type || response.headers.get("content-type") || "image/jpeg",
    ).toLowerCase();

    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Guard against very large originals; the AI writer only needs a modest image.
    if (buffer.byteLength > 8 * 1024 * 1024) return null;

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

// Re-polish an offline-captured finding: the inspector rewrote the field note and
// wants the AI to regenerate the professional write-up from it. Reuses the shared
// /api/ai-capture writer, then overwrites the finding's write-up fields. The row
// STAYS in the review queue (needs_review is left true) so the inspector still
// approves the regenerated version.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    const findingId = String(body?.findingId || body?.finding_id || "").trim();
    const note = cleanText(body?.note);

    if (!inspectionId || !findingId) {
      return NextResponse.json(
        { error: "Missing inspectionId or findingId." },
        { status: 400 },
      );
    }

    if (!note) {
      return NextResponse.json(
        { error: "Add a note for the AI to re-polish." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Confirm the finding belongs to this inspection before spending an AI call.
    const { data: finding, error: findingError } = await admin
      .from("findings")
      .select("id, section, severity")
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (findingError) throw findingError;
    if (!finding) return notFound("Finding not found.");

    const requestedSection = cleanText(body?.section) || cleanText(finding.section);
    const requestedSeverity = cleanText(body?.severity) || cleanText(finding.severity);

    const imageDataUrl = await loadFirstPhotoDataUrl(admin, findingId, inspectionId);

    // Reuse the existing AI writer route so the wording, section routing, and
    // learning-memory behavior stay identical to the field tool. Forward the
    // caller's cookies so AI usage is still attributed to this inspector.
    const origin = new URL(req.url).origin;
    const aiResponse = await fetch(`${origin}/api/ai-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        note,
        inspection_id: inspectionId,
        section: requestedSection,
        severity: requestedSeverity,
        images: imageDataUrl ? [imageDataUrl] : [],
      }),
    });

    const ai = await aiResponse.json().catch(() => ({}));

    if (!aiResponse.ok) {
      return NextResponse.json(
        { error: ai?.error || "AI re-polish failed." },
        { status: 502 },
      );
    }

    const updatePayload: Record<string, any> = {
      title: cleanText(ai.title) || undefined,
      section: cleanText(ai.section) || requestedSection || undefined,
      severity: cleanText(ai.severity) || requestedSeverity || undefined,
      observation: cleanText(ai.observation),
      implication: cleanText(ai.implication),
      recommendation: cleanText(ai.recommendation),
      // Stay in the review queue - the inspector still approves this rewrite.
      needs_review: true,
    };

    // Drop undefined keys so we never blank out a field the AI didn't return.
    Object.keys(updatePayload).forEach((key) => {
      if (updatePayload[key] === undefined) delete updatePayload[key];
    });

    const { data: updated, error: updateError } = await admin
      .from("findings")
      .update(updatePayload)
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .select(
        "id, title, section, severity, observation, implication, recommendation, needs_review",
      )
      .maybeSingle();

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, finding: updated });
  } catch (error: any) {
    console.error("Re-polish finding error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to re-polish finding." },
      { status: 500 },
    );
  }
}

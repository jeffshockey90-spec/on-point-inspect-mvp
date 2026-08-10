import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "inspection-photos";

// Derive a safe, short file extension from the original filename, falling back
// to the MIME subtype (so videos and images alike get a sensible extension).
function extFor(filename: string, contentType: string) {
  const fromName = (String(filename || "").split(".").pop() || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 5) return fromName;

  const sub = (String(contentType || "").split("/")[1] || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (sub === "quicktime") return "mov";
  if (sub) return sub.slice(0, 5);

  return "bin";
}

// POST /api/offline-media-upload — hand the browser a short-lived signed upload
// token for one offline-captured photo OR video on one of the inspector's own
// inspections. The browser then uploads the file DIRECTLY to Supabase storage
// (no Vercel ~4.5MB request-body cap, so large videos work) via
// `uploadToSignedUrl`, then POSTs the resulting storage PATH to
// /api/offline-ai-sync instead of shipping base64 through the function.
//
// Mirrors app/api/lab-report-upload/route.ts exactly (same auth + signed-URL
// approach), targeting the `inspection-photos` bucket.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const inspectionId = String(body?.inspectionId || "").trim();
  const filename = String(body?.filename || "").trim();
  const contentType = String(body?.contentType || "").trim().toLowerCase();

  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
  }

  const admin = getAdminClient();

  // Only the inspection's own inspector/company may attach media to it.
  const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!authorized) return notFound("Report not found.");

  const ext = extFor(filename, contentType);
  const path = `${inspectionId}/offline/${randomUUID()}.${ext}`;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    return NextResponse.json(
      { error: error?.message || "Could not start the upload." },
      { status: 500 }
    );
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    path,
    token: data.token,
    url: pub?.publicUrl || "",
  });
}

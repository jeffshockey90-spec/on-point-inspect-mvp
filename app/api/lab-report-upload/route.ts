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

const BUCKET = "lab-reports";

// POST /api/lab-report-upload — hand the browser a short-lived signed upload
// token for a mold/radon lab report PDF on one of the inspector's own
// inspections. The browser then uploads the file DIRECTLY to Supabase storage
// (no Vercel 4.5MB request-body cap, so large lab PDFs work) and uses the
// returned public URL. The bucket is public, so the link works directly in the
// client report and report emails with no expiry.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const inspectionId = String(body?.inspectionId || "").trim();
  const kind =
    String(body?.kind || "").trim().toLowerCase() === "radon" ? "radon" : "mold";
  const filename = String(body?.filename || "").trim().toLowerCase();

  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
  }
  if (!filename.endsWith(".pdf")) {
    return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
  }

  const admin = getAdminClient();

  // Only the inspection's own inspector/company may attach a lab report to it.
  const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!authorized) return notFound("Report not found.");

  const path = `${inspectionId}/${kind}-${randomUUID()}.pdf`;

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

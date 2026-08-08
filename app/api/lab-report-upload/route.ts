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
const MAX_BYTES = 25 * 1024 * 1024;

// POST /api/lab-report-upload — an inspector uploads a mold/radon lab report
// PDF for one of their inspections. Stored in the public `lab-reports` bucket
// with an unguessable path so the resulting link works directly in the client
// report and report emails (no expiry, unlike a signed URL). Service-role
// upload keeps this independent of storage RLS policies.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const inspectionId = String(form.get("inspectionId") || "").trim();
  const kind =
    String(form.get("kind") || "").trim().toLowerCase() === "radon"
      ? "radon"
      : "mold";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That PDF is over 25 MB. Please use a smaller file." },
      { status: 400 }
    );
  }

  const admin = getAdminClient();

  // Only the inspection's own inspector/company may attach a lab report to it.
  const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!authorized) return notFound("Report not found.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${inspectionId}/${kind}-${randomUUID()}.pdf`;

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    cacheControl: "31536000",
    upsert: false,
    contentType: "application/pdf",
  });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message || "Upload failed." },
      { status: 500 }
    );
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  const url = data?.publicUrl || "";
  if (!url) {
    return NextResponse.json({ error: "Could not build the file link." }, { status: 500 });
  }

  return NextResponse.json({ url });
}

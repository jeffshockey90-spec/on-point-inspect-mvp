import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionAccessFilter } from "../../../../../lib/inspectionAccess";
import {
  addReinspectionAfterPhoto,
  OriginalReportWriteError,
} from "../../../../../lib/reinspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attach an AFTER photo to a re-inspection finding.
 *
 * The client uploads the file to storage first (same helper the field tool
 * uses) and posts the resulting paths here, so the media row itself is written
 * through the re-inspection guard rather than inserted directly. A finding id
 * belonging to the ORIGINAL report is refused with 409: after photos are new
 * media on the new finding and must never be added to the original.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const findingId = Number(body?.findingId);
  if (!Number.isFinite(findingId)) {
    return NextResponse.json({ error: "Missing finding id." }, { status: 400 });
  }
  if (!body?.public_url && !body?.file_path) {
    return NextResponse.json({ error: "Missing photo." }, { status: 400 });
  }

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: finding } = await db
    .from("findings")
    .select("id, inspection_id")
    .eq("id", findingId)
    .maybeSingle();
  if (!finding?.id) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

  const filter = await resolveInspectionAccessFilter(userClient, user.id);
  const { data: owns } = await db
    .from("inspections")
    .select("id")
    .eq("id", finding.inspection_id)
    .eq(filter.column, filter.value)
    .maybeSingle();
  if (!owns?.id) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  try {
    const created = await addReinspectionAfterPhoto(db, { findingId, photo: body });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (error: any) {
    if (error instanceof OriginalReportWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || "Upload failed." }, { status: 500 });
  }
}

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

// Pending async-draft limitations + equipment for an inspection's Field Review
// queue. Ownership-gated, service-role read (so it's independent of per-table
// RLS). Findings have their own review path already; this covers the two newer
// categories. Returns raw rows — the client signs limitation photos via
// /api/limitation-photos and uses equipment image_url directly.
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const inspectionId = String(url.searchParams.get("inspectionId") || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const [limRes, eqRes] = await Promise.all([
      admin
        .from("section_limitations")
        .select("*")
        .eq("inspection_id", inspectionId)
        .eq("needs_review", true)
        .order("created_at", { ascending: true }),
      admin
        .from("equipment_inventory")
        .select("*")
        .eq("inspection_id", inspectionId)
        .eq("needs_review", true)
        .order("created_at", { ascending: true }),
    ]);

    return NextResponse.json({
      ok: true,
      limitations: limRes.data || [],
      equipment: eqRes.data || [],
    });
  } catch (error: any) {
    console.error("Field review pending error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load pending review items." },
      { status: 500 },
    );
  }
}

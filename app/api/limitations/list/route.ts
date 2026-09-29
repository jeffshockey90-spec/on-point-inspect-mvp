import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getAdminClient();

// Lists the existing limitations on an inspection so a capture surface (field
// tool / live camera) can offer them as an "attach photos to this limitation"
// target. Ownership is enforced via authorizeInspection.
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const inspectionId =
      url.searchParams.get("inspection_id") || url.searchParams.get("inspectionId");

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection_id." }, { status: 400 });
    }

    const inspection = await authorizeInspection(supabaseAdmin, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const { data, error } = await supabaseAdmin
      .from("section_limitations")
      .select("id, section, label, custom_text, limitation_comment, ai_notes, created_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const limitations = (data || []).map((row: any) => {
      const label = String(
        row.label ||
          row.custom_text ||
          row.limitation_comment ||
          row.ai_notes ||
          "Limitation",
      )
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: String(row.id),
        section: String(row.section || ""),
        label: label.length > 90 ? `${label.slice(0, 90)}…` : label || "Limitation",
      };
    });

    return NextResponse.json({ limitations });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load limitations." },
      { status: 500 },
    );
  }
}

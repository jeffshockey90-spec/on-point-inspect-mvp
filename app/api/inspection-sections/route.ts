import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSessionUser, authorizeInspection } from "../../../lib/apiAuth";
import { resolveReportSections } from "../../../lib/reportSections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The fixed baseline sections (same order the report builder uses).
const BASE_SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Returns an inspection's ACTIVE report sections — the base list merged with the
// inspector's custom sections and deletions (and any saved custom order) — so the
// field tool / AI camera section pickers match the report builder. Falls back to
// the base list on any miss so capture never loses its section options.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ sections: BASE_SECTIONS }, { status: 200 });

  const inspectionId = new URL(req.url).searchParams.get("inspection_id");
  if (!inspectionId) return NextResponse.json({ sections: BASE_SECTIONS });

  try {
    const authorized = await authorizeInspection(admin, user.id, inspectionId);
    if (!authorized) return NextResponse.json({ sections: BASE_SECTIONS });

    const [{ data: inspection }, { data: overrides }] = await Promise.all([
      admin.from("inspections").select("service_mode, report_section_order, template_sections").eq("id", inspectionId).maybeSingle(),
      admin.from("report_section_overrides").select("*").eq("inspection_id", inspectionId).order("sort_order", { ascending: true }),
    ]);

    const sections = resolveReportSections({
      overrides: overrides || [],
      customOrder: (inspection as any)?.report_section_order,
      serviceMode: (inspection as any)?.service_mode,
      templateSections: (inspection as any)?.template_sections,
    });

    return NextResponse.json({ sections: sections.length ? sections : BASE_SECTIONS });
  } catch {
    return NextResponse.json({ sections: BASE_SECTIONS });
  }
}

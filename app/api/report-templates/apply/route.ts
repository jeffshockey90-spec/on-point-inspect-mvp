import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSessionUser, authorizeInspection } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Applies (or clears) a report template on an inspection: snapshots the
// template's section list onto inspections.template_sections so the report,
// field tool, share page, and PDF all use it. Pass templateId=null to clear
// back to the standard sections. Never deletes findings.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
  const templateId = body?.templateId ? String(body.templateId).trim() : null;
  if (!inspectionId) return NextResponse.json({ error: "Missing inspection id." }, { status: 400 });

  const authorized = await authorizeInspection(admin, user.id, inspectionId);
  if (!authorized) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });

  let templateSections: string[] | null = null;
  if (templateId) {
    const { data: template } = await admin
      .from("report_templates")
      .select("sections")
      .eq("id", templateId)
      .maybeSingle();
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    templateSections = Array.isArray(template.sections) ? template.sections : [];
  }

  const { error } = await admin
    .from("inspections")
    .update({ template_sections: templateSections, report_template_id: templateId })
    .eq("id", inspectionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sections: templateSections });
}

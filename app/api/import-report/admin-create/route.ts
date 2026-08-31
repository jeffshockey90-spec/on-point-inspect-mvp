import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const STANDARD_SECTIONS = new Set([
  "inspection details", "exterior", "roof", "basement, foundation, crawlspace & structure",
  "heating", "cooling", "plumbing", "electrical", "fireplace",
  "attic, insulation & ventilation", "doors, windows & interior", "built-in appliances",
  "garage", "disclaimers",
]);

// Platform-owner ONLY cross-tenant import. Creates an imported inspection (with
// its findings, photos and custom sections) inside ANY company/inspector, so the
// super-admin can set a new company or inspector up when they ask. Bypasses RLS
// via service-role BUT only after verifying the caller is a platform owner and
// the target company exists. Regular (same-company) imports never come here --
// they run client-side under the company-owner RLS policy.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Platform owner only." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}) as any);
  const targetCompanyId = String(body?.targetCompanyId || "").trim();
  let targetInspectorId = String(body?.targetInspectorId || "").trim();
  const saveAsDemo = Boolean(body?.saveAsDemo);
  const inspectionInput = body?.inspection || {};
  const findings: any[] = Array.isArray(body?.findings) ? body.findings : [];
  const customSections: string[] = Array.isArray(body?.customSections) ? body.customSections : [];

  if (!targetCompanyId) {
    return NextResponse.json({ error: "A target company is required." }, { status: 400 });
  }

  // Confirm the company exists.
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("id", targetCompanyId)
    .single();
  if (!company) {
    return NextResponse.json({ error: "That company was not found." }, { status: 404 });
  }

  // Resolve the inspector. Empty target => "company-level": assign to the
  // company's owner so they can reassign it via dispatch.
  if (!targetInspectorId) {
    const { data: members } = await admin
      .from("company_users")
      .select("user_id, role")
      .eq("company_id", targetCompanyId);
    const ownerRow = (members || []).find((m: any) => String(m?.role || "") === "owner");
    targetInspectorId = String(ownerRow?.user_id || (members || [])[0]?.user_id || "");
  } else {
    // Ensure the chosen inspector really belongs to the target company.
    const { data: membership } = await admin
      .from("company_users")
      .select("user_id")
      .eq("company_id", targetCompanyId)
      .eq("user_id", targetInspectorId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: "That inspector is not part of the selected company." },
        { status: 400 },
      );
    }
  }

  if (!targetInspectorId) {
    return NextResponse.json({ error: "Could not resolve an inspector for that company." }, { status: 400 });
  }

  const demoAddress = String(inspectionInput.property_address || "Imported Report");

  const { data: inspection, error: inspectionError } = await admin
    .from("inspections")
    .insert([
      {
        inspector_id: targetInspectorId,
        company_id: targetCompanyId,
        client_name: inspectionInput.client_name || "Imported Client",
        client_email: inspectionInput.client_email || null,
        client_phone: inspectionInput.client_phone || null,
        realtor_name: inspectionInput.realtor_name || null,
        realtor_email: inspectionInput.realtor_email || null,
        agent_name: inspectionInput.realtor_name || null,
        agent_email: inspectionInput.realtor_email || null,
        property_address: demoAddress,
        address: demoAddress,
        city: inspectionInput.city || null,
        state: inspectionInput.state || null,
        zip: inspectionInput.zip || null,
        cover_photo_url: inspectionInput.cover_photo_url || null,
        property_photo_url: inspectionInput.cover_photo_url || null,
        property_image_url: inspectionInput.cover_photo_url || null,
        image_url: inspectionInput.cover_photo_url || null,
        photo_url: inspectionInput.cover_photo_url || null,
        inspection_date: inspectionInput.inspection_date || null,
        inspection_time: "10:00",
        inspection_status: "Imported Draft",
        price: 0,
        invoice_amount: 0,
        balance_due: 0,
        amount_paid: 0,
        invoice_status: "Not Required",
        payment_status: "Not Required",
        services: "Imported Report",
        service_mode: "home",
        inspection_type: "Imported Report",
        notes: inspectionInput.notes || "Imported by platform owner. Review before publishing.",
        report_status: saveAsDemo ? "Demo" : "Draft",
        is_published: saveAsDemo,
        published: saveAsDemo,
        is_demo: saveAsDemo,
        demo_enabled: saveAsDemo,
      },
    ])
    .select()
    .single();

  if (inspectionError || !inspection) {
    return NextResponse.json(
      { error: inspectionError?.message || "Could not create the inspection." },
      { status: 500 },
    );
  }

  // Findings.
  const findingRows = findings.map((f: any) => ({
    inspection_id: inspection.id,
    company_id: targetCompanyId,
    section: String(f?.section || "Inspection Details"),
    title: String(f?.title || "Imported Finding"),
    observation: String(f?.observation || ""),
    implication: String(f?.implication || ""),
    recommendation: String(f?.recommendation || ""),
    severity: String(f?.severity || "Recommended Repair"),
    image_url: String(f?.image_url || (Array.isArray(f?.photos) ? f.photos[0] : "") || "") || null,
  }));

  let inserted: any[] = [];
  if (findingRows.length > 0) {
    const { data: fData, error: fErr } = await admin
      .from("findings")
      .insert(findingRows)
      .select("id");
    if (fErr) {
      return NextResponse.json(
        { error: `Inspection created but findings failed: ${fErr.message}`, inspectionId: inspection.id },
        { status: 500 },
      );
    }
    inserted = fData || [];
  }

  // Photos (mapped to findings by insert order).
  const photoRows: any[] = [];
  inserted.forEach((row: any, index: number) => {
    const source = findings[index] || {};
    const urls: string[] = Array.from(
      new Set([source.image_url, ...(Array.isArray(source.photos) ? source.photos : [])].filter(Boolean)),
    );
    for (const url of urls) {
      photoRows.push({
        inspection_id: String(inspection.id),
        finding_id: String(row.id),
        company_id: targetCompanyId,
        public_url: url,
        thumbnail_url: url,
      });
    }
  });
  if (photoRows.length > 0) {
    await admin.from("photos").insert(photoRows);
  }

  // Custom sections (non-standard names) so they render under their own name.
  const custom = customSections
    .map((s) => String(s || "").trim())
    .filter((s) => s && !STANDARD_SECTIONS.has(s.toLowerCase()));
  const uniqueCustom = Array.from(new Map(custom.map((s) => [s.toLowerCase(), s])).values());
  if (uniqueCustom.length > 0) {
    await admin.from("report_section_overrides").insert(
      uniqueCustom.map((name, i) => ({
        inspection_id: inspection.id,
        section_name: name,
        is_custom: true,
        sort_order: 100 + i,
      })),
    );
  }

  return NextResponse.json({ ok: true, inspectionId: inspection.id });
}

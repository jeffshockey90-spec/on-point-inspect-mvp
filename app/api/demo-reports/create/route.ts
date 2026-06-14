import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function makeDemoSlug() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanRowForInsert(row: any, patch: Record<string, any>) {
  const copy = { ...(row || {}) };

  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  delete copy.deleted_at;

  return {
    ...copy,
    ...patch,
  };
}

function sanitizeInspectionForDemo(inspection: any, userId: string) {
  return cleanRowForInsert(inspection, {
    inspector_id: userId,
    is_demo: true,
    source_inspection_id: inspection.id,
    demo_slug: makeDemoSlug(),
    report_status: "Demo",
    published: true,
    client_name: "Sample Client",
    client_email: null,
    client_phone: null,
    email: null,
    realtor_name: null,
    realtor_email: null,
    agent_email: null,
    agent_name: null,
    agreement_status: null,
    agreement_state: inspection.agreement_state || inspection.state || null,
    agreement_template_id: null,
    agreement_template_ids: null,
    payment_status: "Demo",
    invoice_status: "Demo",
    amount_paid: 0,
    balance_due: 0,
    paid_at: null,
    stripe_payment_intent_id: null,
    stripe_checkout_session_id: null,
    payment_notes: null,
    invoice_notes: null,
  });
}

async function cloneSimpleTable({
  admin,
  table,
  inspectionId,
  newInspectionId,
  extraPatch = {},
}: {
  admin: any;
  table: string;
  inspectionId: string;
  newInspectionId: number;
  extraPatch?: Record<string, any>;
}) {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq("inspection_id", inspectionId);

  if (error) {
    console.error(`Demo clone load failed for ${table}:`, error);
    return [];
  }

  const rows = (data || []).map((row: any) =>
    cleanRowForInsert(row, {
      inspection_id: newInspectionId,
      ...extraPatch,
    })
  );

  if (rows.length === 0) return [];

  const { data: inserted, error: insertError } = await admin
    .from(table)
    .insert(rows)
    .select("*");

  if (insertError) {
    console.error(`Demo clone insert failed for ${table}:`, insertError);
    return [];
  }

  return inserted || [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inspectionId = String(body.inspectionId || body.inspection_id || "");

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: originalInspection, error: inspectionError } = await admin
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (inspectionError || !originalInspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const { data: demoInspection, error: demoInsertError } = await admin
      .from("inspections")
      .insert(sanitizeInspectionForDemo(originalInspection, user.id))
      .select("*")
      .single();

    if (demoInsertError || !demoInspection) {
      console.error("Demo inspection insert error:", demoInsertError);
      return NextResponse.json(
        {
          error:
            demoInsertError?.message ||
            "Failed to create demo inspection. Make sure demo columns were added in Supabase.",
        },
        { status: 500 }
      );
    }

    const newInspectionId = Number(demoInspection.id);

    // Clone findings first so photo finding_id references can be remapped.
    const { data: originalFindings, error: findingsError } = await admin
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    const findingIdMap: Record<string, number> = {};

    if (!findingsError && originalFindings?.length) {
      for (const finding of originalFindings) {
        const { data: newFinding, error: newFindingError } = await admin
          .from("findings")
          .insert(
            cleanRowForInsert(finding, {
              inspection_id: newInspectionId,
            })
          )
          .select("*")
          .single();

        if (!newFindingError && newFinding?.id) {
          findingIdMap[String(finding.id)] = newFinding.id;
        } else {
          console.error("Demo finding clone error:", newFindingError);
        }
      }
    }

    // Clone photos attached to findings.
    const originalFindingIds = Object.keys(findingIdMap);
    if (originalFindingIds.length > 0) {
      const { data: originalPhotos, error: photosError } = await admin
        .from("photos")
        .select("*")
        .in("finding_id", originalFindingIds);

      if (!photosError && originalPhotos?.length) {
        const photoRows = originalPhotos
          .map((photo: any) => {
            const newFindingId = findingIdMap[String(photo.finding_id)];
            if (!newFindingId) return null;

            return cleanRowForInsert(photo, {
              finding_id: newFindingId,
            });
          })
          .filter(Boolean);

        if (photoRows.length > 0) {
          const { error } = await admin.from("photos").insert(photoRows);
          if (error) console.error("Demo photos clone error:", error);
        }
      }
    }

    await cloneSimpleTable({ admin, table: "section_reference_photos", inspectionId, newInspectionId });
    await cloneSimpleTable({ admin, table: "section_checklist_selections", inspectionId, newInspectionId });
    await cloneSimpleTable({ admin, table: "report_disclaimers", inspectionId, newInspectionId });
    await cloneSimpleTable({ admin, table: "equipment_inventory", inspectionId, newInspectionId });
    await cloneSimpleTable({ admin, table: "mold_tests", inspectionId, newInspectionId });
    await cloneSimpleTable({ admin, table: "radon_tests", inspectionId, newInspectionId });

    // Clone limitations and limitation photos with limitation_id remapping.
    const { data: originalLimitations } = await admin
      .from("section_limitations")
      .select("*")
      .eq("inspection_id", inspectionId);

    const limitationIdMap: Record<string, number> = {};

    for (const limitation of originalLimitations || []) {
      const { data: newLimitation, error: limitationError } = await admin
        .from("section_limitations")
        .insert(
          cleanRowForInsert(limitation, {
            inspection_id: newInspectionId,
          })
        )
        .select("*")
        .single();

      if (!limitationError && newLimitation?.id) {
        limitationIdMap[String(limitation.id)] = newLimitation.id;
      }
    }

    const originalLimitationIds = Object.keys(limitationIdMap);
    if (originalLimitationIds.length > 0) {
      const { data: limitationPhotos } = await admin
        .from("limitation_photos")
        .select("*")
        .in("limitation_id", originalLimitationIds);

      const limitationPhotoRows = (limitationPhotos || [])
        .map((photo: any) => {
          const newLimitationId = limitationIdMap[String(photo.limitation_id)];
          if (!newLimitationId) return null;

          return cleanRowForInsert(photo, {
            limitation_id: newLimitationId,
          });
        })
        .filter(Boolean);

      if (limitationPhotoRows.length > 0) {
        const { error } = await admin.from("limitation_photos").insert(limitationPhotoRows);
        if (error) console.error("Demo limitation photos clone error:", error);
      }
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "demo_report_created",
      resource_type: "inspection",
      resource_id: String(newInspectionId),
      metadata: {
        source_inspection_id: inspectionId,
      },
    });

    return NextResponse.json({
      ok: true,
      demoId: String(newInspectionId),
      demoSlug: demoInspection.demo_slug || null,
      demoUrl: `/demo/${newInspectionId}`,
    });
  } catch (error: any) {
    console.error("Create demo report error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to create demo report." },
      { status: 500 }
    );
  }
}

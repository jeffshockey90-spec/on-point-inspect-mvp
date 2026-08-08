import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

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

function sanitizeInspectionForDemo(inspection: any, ownerId: string) {
  const {
    id,
    created_at,
    updated_at,
    client_name,
    client_email,
    client_phone,
    realtor_name,
    realtor_email,
    agent_email,
    buyer_email,
    seller_email,
    email,
    phone,
    agreement_status,
    agreement_template_id,
    agreement_template_ids,
    agreement_state,
    payment_status,
    invoice_status,
    invoice_amount,
    amount_paid,
    balance_due,
    stripe_payment_intent_id,
    stripe_checkout_session_id,
    paid_at,
    client_portal_token,
    access_token,
    share_token,
    public_share_token,
    report_share_token,
    ...rest
  } = inspection || {};

  return {
    ...rest,

    inspector_id: ownerId,

    // Each inspection needs its OWN unguessable share token -- copying the
    // source report's token violates inspections_public_share_token_unique and
    // is what made "Create Demo Report" fail. Generate a fresh one; leave the
    // other token columns unset so the demo doesn't reuse private links.
    public_share_token: randomUUID().replace(/-/g, ""),

    // Keep report content and property context, but strip private people/payment data.
    client_name: "Sample Client",
    client_email: null,
    client_phone: null,
    realtor_name: "Sample Realtor",
    realtor_email: null,
    agent_email: null,

    agreement_status: "demo",
    payment_status: "demo",
    invoice_status: "demo",
    amount_paid: 0,
    balance_due: 0,

    report_status: "Published",
    published: true,
    published_at: new Date().toISOString(),

    is_demo: true,
    demo_source_inspection_id: Number(id),
    demo_created_at: new Date().toISOString(),
  };
}

async function copyRows({
  admin,
  table,
  sourceColumn,
  targetColumn,
  sourceId,
  targetId,
  stripColumns = [],
}: {
  admin: any;
  table: string;
  sourceColumn: string;
  targetColumn: string;
  sourceId: string;
  targetId: string | number;
  stripColumns?: string[];
}) {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq(sourceColumn, sourceId);

  if (error) {
    console.error(`Demo copy read error for ${table}:`, error);
    return;
  }

  const rows = (data || []).map((row: any) => {
    const copy = { ...row };

    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;

    stripColumns.forEach((column) => {
      delete copy[column];
    });

    copy[targetColumn] = targetId;

    return copy;
  });

  if (rows.length === 0) return;

  const { error: insertError } = await admin.from(table).insert(rows);

  if (insertError) {
    console.error(`Demo copy insert error for ${table}:`, insertError);
  }
}

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json().catch(() => ({}));

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const userClient = await createUserClient();

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const admin = createAdminClient();
    const accessFilter = await resolveInspectionAccessFilter(admin, user.id);

    const { data: inspection, error: inspectionError } = await admin
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const demoInspection = sanitizeInspectionForDemo(inspection, user.id);

    const { data: createdDemo, error: createError } = await admin
      .from("inspections")
      .insert(demoInspection)
      .select("id")
      .single();

    if (createError || !createdDemo?.id) {
      console.error("Demo inspection create error:", createError);

      return NextResponse.json(
        {
          error:
            createError?.message ||
            "Could not create demo report. Check demo columns were added.",
        },
        { status: 500 }
      );
    }

    const demoId = createdDemo.id;

    await copyRows({
      admin,
      table: "findings",
      sourceColumn: "inspection_id",
      targetColumn: "inspection_id",
      sourceId: String(inspectionId),
      targetId: demoId,
      stripColumns: ["client_email", "realtor_email", "email"],
    });

    await copyRows({
      admin,
      table: "section_checklist_selections",
      sourceColumn: "inspection_id",
      targetColumn: "inspection_id",
      sourceId: String(inspectionId),
      targetId: demoId,
    });

    await copyRows({
      admin,
      table: "section_limitations",
      sourceColumn: "inspection_id",
      targetColumn: "inspection_id",
      sourceId: String(inspectionId),
      targetId: demoId,
    });

    await copyRows({
      admin,
      table: "section_reference_photos",
      sourceColumn: "inspection_id",
      targetColumn: "inspection_id",
      sourceId: String(inspectionId),
      targetId: demoId,
    });

    await copyRows({
      admin,
      table: "report_disclaimers",
      sourceColumn: "inspection_id",
      targetColumn: "inspection_id",
      sourceId: String(inspectionId),
      targetId: demoId,
    });

    await copyRows({
      admin,
      table: "equipment_inventory",
      sourceColumn: "inspection_id",
      targetColumn: "inspection_id",
      sourceId: String(inspectionId),
      targetId: demoId,
    });

    return NextResponse.json({
      ok: true,
      demoInspectionId: demoId,
      demoUrl: `/demo/${demoId}`,
    });
  } catch (error: any) {
    console.error("Create demo report error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to create demo report." },
      { status: 500 }
    );
  }
}

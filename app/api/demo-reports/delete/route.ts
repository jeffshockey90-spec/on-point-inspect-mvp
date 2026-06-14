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

async function safeDelete(admin: any, table: string, column: string, value: any) {
  try {
    const { error } = await admin.from(table).delete().eq(column, value);

    if (error) {
      console.error(`Delete demo cleanup failed for ${table}:`, error);
    }
  } catch (error) {
    console.error(`Delete demo cleanup exception for ${table}:`, error);
  }
}

export async function POST(req: Request) {
  try {
    const { demoInspectionId } = await req.json().catch(() => ({}));

    if (!demoInspectionId) {
      return NextResponse.json(
        { error: "Missing demo inspection ID." },
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

    const { data: demoInspection, error: demoError } = await admin
      .from("inspections")
      .select("id, inspector_id, is_demo")
      .eq("id", demoInspectionId)
      .eq("inspector_id", user.id)
      .eq("is_demo", true)
      .single();

    if (demoError || !demoInspection) {
      return NextResponse.json(
        { error: "Demo report not found." },
        { status: 404 }
      );
    }

    const { data: demoFindings } = await admin
      .from("findings")
      .select("id")
      .eq("inspection_id", demoInspectionId);

    const findingIds = (demoFindings || []).map((finding: any) => finding.id);

    if (findingIds.length > 0) {
      try {
        await admin.from("photos").delete().in("finding_id", findingIds);
      } catch (error) {
        console.error("Delete demo photos cleanup failed:", error);
      }
    }

    await safeDelete(admin, "findings", "inspection_id", demoInspectionId);
    await safeDelete(admin, "section_checklist_selections", "inspection_id", demoInspectionId);
    await safeDelete(admin, "section_limitations", "inspection_id", demoInspectionId);
    await safeDelete(admin, "section_reference_photos", "inspection_id", demoInspectionId);
    await safeDelete(admin, "report_disclaimers", "inspection_id", demoInspectionId);
    await safeDelete(admin, "equipment_inventory", "inspection_id", demoInspectionId);
    await safeDelete(admin, "inspection_view_events", "inspection_id_bigint", Number(demoInspectionId));

    const { error: deleteInspectionError } = await admin
      .from("inspections")
      .delete()
      .eq("id", demoInspectionId)
      .eq("inspector_id", user.id)
      .eq("is_demo", true);

    if (deleteInspectionError) {
      throw deleteInspectionError;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Delete demo report error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to delete demo report." },
      { status: 500 }
    );
  }
}

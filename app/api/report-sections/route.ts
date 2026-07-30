import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../utils/supabase/server";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function cleanText(value: any) {
  return String(value || "").trim();
}

// GET is used both by the report builder (any status) and by the public
// print/share/PDF-download paths (published inspections only, enforced by
// RLS since this uses the anon-scoped session client, not the admin one).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = cleanText(url.searchParams.get("inspection_id"));

    if (!inspectionId) {
      return NextResponse.json({ error: "inspection_id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("report_section_overrides")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sections: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to load report sections." },
      { status: 500 }
    );
  }
}

async function getOwnedInspectionId(supabase: any, inspectionId: string, userId: string) {
  const accessFilter = await resolveInspectionAccessFilter(supabase, userId);

  const { data, error } = await supabase
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq(accessFilter.column, accessFilter.value)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const inspectionId = cleanText(body.inspectionId || body.inspection_id);
    const sectionName = cleanText(body.sectionName || body.section_name);
    const action = cleanText(body.action || "create").toLowerCase();

    if (!inspectionId) {
      return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
    }

    if (!sectionName) {
      return NextResponse.json({ error: "sectionName is required" }, { status: 400 });
    }

    if (!["create", "delete", "restore"].includes(action)) {
      return NextResponse.json({ error: "action must be create, delete, or restore" }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownedInspectionId = await getOwnedInspectionId(supabase, inspectionId, user.id);

    if (!ownedInspectionId) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    // The service-role client is used from here on for the actual writes -
    // ownership was already verified above, and this avoids RLS surprises
    // on a table with mixed anon/authenticated policies.
    const admin = createAdminClient();

    if (action === "create") {
      const { data: existing } = await admin
        .from("report_section_overrides")
        .select("id, deleted_at")
        .eq("inspection_id", ownedInspectionId)
        .ilike("section_name", sectionName)
        .maybeSingle();

      if (existing && !existing.deleted_at) {
        return NextResponse.json(
          { error: "A section with that name already exists." },
          { status: 400 }
        );
      }

      if (existing && existing.deleted_at) {
        // Re-adding a name that was previously deleted just restores it.
        const { data: restored, error: restoreError } = await admin
          .from("report_section_overrides")
          .update({ deleted_at: null })
          .eq("id", existing.id)
          .select("*")
          .single();

        if (restoreError) {
          return NextResponse.json({ error: restoreError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, section: restored });
      }

      const { data: maxOrderRow } = await admin
        .from("report_section_overrides")
        .select("sort_order")
        .eq("inspection_id", ownedInspectionId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (maxOrderRow?.sort_order ?? 0) + 1;

      const { data: created, error: createError } = await admin
        .from("report_section_overrides")
        .insert({
          inspection_id: ownedInspectionId,
          section_name: sectionName,
          is_custom: true,
          sort_order: nextOrder,
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, section: created });
    }

    if (action === "delete") {
      const { data: existingRow } = await admin
        .from("report_section_overrides")
        .select("id")
        .eq("inspection_id", ownedInspectionId)
        .ilike("section_name", sectionName)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existingRow) {
        const { data: updated, error: updateError } = await admin
          .from("report_section_overrides")
          .update({ deleted_at: now })
          .eq("id", existingRow.id)
          .select("*")
          .single();

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, section: updated });
      }

      // No existing row means this is a built-in section being deleted for
      // the first time - create the override row already marked deleted.
      const { data: created, error: createError } = await admin
        .from("report_section_overrides")
        .insert({
          inspection_id: ownedInspectionId,
          section_name: sectionName,
          is_custom: false,
          sort_order: 0,
          deleted_at: now,
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, section: created });
    }

    // action === "restore"
    const { data: rowToRestore } = await admin
      .from("report_section_overrides")
      .select("id")
      .eq("inspection_id", ownedInspectionId)
      .ilike("section_name", sectionName)
      .maybeSingle();

    if (!rowToRestore) {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }

    const { data: restored, error: restoreError } = await admin
      .from("report_section_overrides")
      .update({ deleted_at: null })
      .eq("id", rowToRestore.id)
      .select("*")
      .single();

    if (restoreError) {
      return NextResponse.json({ error: restoreError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, section: restored });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to update report sections." },
      { status: 500 }
    );
  }
}

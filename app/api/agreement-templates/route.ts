import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components / Route Handlers may not always allow cookie writes.
          }
        },
      },
    }
  );
}

async function getCompanyIdForUser(supabase: any, userId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.company_id || null;
}

function normalizeState(value: any) {
  const state = String(value || "GENERAL").trim().toUpperCase();
  return state || "GENERAL";
}

function normalizeServiceType(value: any) {
  return String(value || "home_inspection").trim() || "home_inspection";
}

async function clearCompetingDefault({
  supabase,
  companyId,
  scope,
  state,
  serviceType,
  excludeId,
}: {
  supabase: any;
  companyId: any;
  scope: { column: "inspector_id" | "company_id"; value: any };
  state: string;
  serviceType: string;
  excludeId?: string;
}) {
  let query = supabase
    .from("agreement_templates")
    .update({
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq(scope.column, scope.value)
    .eq("state", state)
    .eq("service_type", serviceType);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  await query;
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to view agreement templates." },
        { status: 401 }
      );
    }

    const companyId = await getCompanyIdForUser(supabase, user.id);
    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const activeOnly = url.searchParams.get("activeOnly") !== "false";

    let query = supabase
      .from("agreement_templates")
      .select("*")
      .eq(accessFilter.column, accessFilter.value)
      .order("state", { ascending: true })
      .order("service_type", { ascending: true })
      .order("display_order", { ascending: true })
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    if (state) {
      query = query.eq("state", normalizeState(state));
    }

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      templates: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load agreement templates." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to create agreement templates." },
        { status: 401 }
      );
    }

    const companyId = await getCompanyIdForUser(supabase, user.id);
    const body = await req.json();

    const title = String(body.title || "").trim();
    const version = String(body.version || "v1").trim();
    const state = normalizeState(body.state || body.state_code);
    const serviceType = normalizeServiceType(body.service_type || body.template_type);
    const displayOrder = Number(body.display_order || 0);
    const templateBody = String(body.body || "").trim();
    const isActive =
      body.is_active === undefined ? true : Boolean(body.is_active);
    const isDefault = Boolean(body.is_default);

    if (!title || !templateBody) {
      return NextResponse.json(
        { error: "Agreement title and body are required." },
        { status: 400 }
      );
    }

    if (isDefault) {
      await clearCompetingDefault({
        supabase,
        companyId,
        scope: { column: "inspector_id", value: user.id },
        state,
        serviceType,
      });
    }

    const { data, error } = await supabase
      .from("agreement_templates")
      .insert({
        inspector_id: user.id,
        company_id: companyId,
        state,
        state_code: state,
        title,
        version,
        service_type: serviceType,
        template_type: serviceType,
        display_order: displayOrder,
        body: templateBody,
        is_active: isActive,
        is_default: isDefault,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      template: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save agreement template." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to update agreement templates." },
        { status: 401 }
      );
    }

    const companyId = await getCompanyIdForUser(supabase, user.id);
    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);
    const body = await req.json();
    const id = String(body.id || "");

    if (!id) {
      return NextResponse.json(
        { error: "Missing agreement template ID." },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const nextState =
      body.state !== undefined || body.state_code !== undefined
        ? normalizeState(body.state || body.state_code)
        : null;

    const nextServiceType =
      body.service_type !== undefined || body.template_type !== undefined
        ? normalizeServiceType(body.service_type || body.template_type)
        : null;

    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.version !== undefined) updates.version = String(body.version).trim();

    if (nextState) {
      updates.state = nextState;
      updates.state_code = nextState;
    }

    if (nextServiceType) {
      updates.service_type = nextServiceType;
      updates.template_type = nextServiceType;
    }

    if (body.display_order !== undefined) {
      updates.display_order = Number(body.display_order || 0);
    }

    if (body.body !== undefined) updates.body = String(body.body);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
    if (body.is_default !== undefined) updates.is_default = Boolean(body.is_default);
    if (companyId) updates.company_id = companyId;

    if (updates.is_default === true) {
      const { data: existing } = await supabase
        .from("agreement_templates")
        .select("state, service_type")
        .eq("id", id)
        .eq(accessFilter.column, accessFilter.value)
        .maybeSingle();

      await clearCompetingDefault({
        supabase,
        companyId,
        scope: accessFilter,
        state: updates.state || existing?.state || "GENERAL",
        serviceType: updates.service_type || existing?.service_type || "home_inspection",
        excludeId: id,
      });
    }

    let query = supabase
      .from("agreement_templates")
      .update(updates)
      .eq("id", id)
      .eq(accessFilter.column, accessFilter.value);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;

    return NextResponse.json({
      template: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update agreement template." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to delete agreement templates." },
        { status: 401 }
      );
    }

    const companyId = await getCompanyIdForUser(supabase, user.id);
    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") || "");

    if (!id) {
      return NextResponse.json(
        { error: "Missing agreement template ID." },
        { status: 400 }
      );
    }

    let query = supabase
      .from("agreement_templates")
      .delete()
      .eq("id", id)
      .eq(accessFilter.column, accessFilter.value);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete agreement template." },
      { status: 500 }
    );
  }
}

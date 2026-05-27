import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const activeOnly = url.searchParams.get("activeOnly") !== "false";

    let query = supabase
      .from("agreement_templates")
      .select("*")
      .order("state", { ascending: true })
      .order("service_type", { ascending: true })
      .order("display_order", { ascending: true })
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (state) {
      query = query.eq("state", state.toUpperCase());
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
    const body = await req.json();

    const title = String(body.title || "").trim();
    const version = String(body.version || "v1").trim();
    const state = String(body.state || "MD").trim().toUpperCase();
    const serviceType = String(body.service_type || "home_inspection").trim();
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

    if (!["MD", "WV", "PA"].includes(state)) {
      return NextResponse.json(
        { error: "State must be MD, WV, or PA." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("agreement_templates")
      .insert({
        state,
        title,
        version,
        service_type: serviceType,
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

    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.version !== undefined) updates.version = String(body.version).trim();
    if (body.state !== undefined) updates.state = String(body.state).trim().toUpperCase();
    if (body.service_type !== undefined) updates.service_type = String(body.service_type).trim();
    if (body.display_order !== undefined) updates.display_order = Number(body.display_order || 0);
    if (body.body !== undefined) updates.body = String(body.body);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
    if (body.is_default !== undefined) updates.is_default = Boolean(body.is_default);

    const { data, error } = await supabase
      .from("agreement_templates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

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

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = url.searchParams.get("inspection_id");

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection_id." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      contacts: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load contacts." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = String(body.inspection_id || "");
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const role = String(body.role || "client");
    const agreementRequired = Boolean(body.agreement_required);
    const portalAccess =
      body.portal_access === undefined
        ? true
        : Boolean(body.portal_access);

    if (!inspectionId || !name || !email) {
      return NextResponse.json(
        { error: "Inspection, name, and email are required." },
        { status: 400 }
      );
    }

    const { data: inspection, error: inspectionError } = await supabaseAdmin
      .from("inspections")
      .select("id, inspector_id")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inspection_contacts")
      .insert({
        inspection_id: inspection.id,
        inspector_id: inspection.inspector_id,
        name,
        email,
        role,
        agreement_required: agreementRequired,
        portal_access: portalAccess,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      contact: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save contact." },
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
        { error: "Missing contact ID." },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.email !== undefined) updates.email = String(body.email).trim();
    if (body.role !== undefined) updates.role = String(body.role);
    if (body.agreement_required !== undefined) {
      updates.agreement_required = Boolean(body.agreement_required);
    }
    if (body.portal_access !== undefined) {
      updates.portal_access = Boolean(body.portal_access);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("inspection_contacts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      contact: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update contact." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing contact ID." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("inspection_contacts")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete contact." },
      { status: 500 }
    );
  }
}

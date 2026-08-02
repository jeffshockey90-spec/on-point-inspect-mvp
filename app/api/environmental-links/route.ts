import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";
import { reportSecurityEvent } from "../../../lib/securityAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const inspectionId = searchParams.get("inspection_id");

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection_id." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Lab results (mold/radon) are sensitive. Only the inspection's own
    // inspector/company may pull them; no anonymous id enumeration.
    const user = await getSessionUser();
    if (!user) {
      await reportSecurityEvent({ req, type: "env_enum", detail: { inspection_id: inspectionId } });
      return unauthorized();
    }

    const authorized = await authorizeInspection(
      supabase,
      user.id,
      Number(inspectionId),
      "id"
    );
    if (!authorized) {
      await reportSecurityEvent({ req, type: "env_enum", detail: { inspection_id: inspectionId, user_id: user.id } });
      return notFound();
    }

    const { data: moldTest, error: moldError } = await supabase
      .from("mold_tests")
      .select("*")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (moldError) {
      console.error("Environmental mold link error:", moldError);
    }

    const { data: radonTest, error: radonError } = await supabase
      .from("radon_tests")
      .select("*")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (radonError) {
      console.error("Environmental radon link error:", radonError);
    }

    return NextResponse.json({
      mold_test: moldTest || null,
      radon_test: radonTest || null,
      mold_report_url: moldTest?.lab_report_url || "",
      radon_report_url: radonTest?.report_url || "",
    });
  } catch (error: any) {
    console.error("Environmental links API error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to load environmental links." },
      { status: 500 }
    );
  }
}

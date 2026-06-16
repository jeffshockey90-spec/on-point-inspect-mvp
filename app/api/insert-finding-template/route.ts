import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
        setAll() {},
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const { inspectionId, templateId } = await req.json();

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from("finding_templates")
      .select("*")
      .eq("id", templateId)
      .eq("inspector_id", user.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const { data: finding, error: insertError } = await supabase
      .from("findings")
      .insert({
        inspection_id: inspectionId,
        title: template.title || "Untitled Finding",
        section: template.section || "Inspection Details",
        severity: template.severity || "Recommended Repair",
        observation: template.observation || "",
        implication: template.implication || "",
        recommendation: template.recommendation || "",
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || "Failed to insert template" },
        { status: 500 }
      );
    }

    const nextUsageCount = Number(template.usage_count || 0) + 1;

    await supabase
      .from("finding_templates")
      .update({
        usage_count: nextUsageCount,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id)
      .eq("inspector_id", user.id);

    return NextResponse.json({
      success: true,
      finding,
      usage_count: nextUsageCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to insert template" },
      { status: 500 }
    );
  }
}

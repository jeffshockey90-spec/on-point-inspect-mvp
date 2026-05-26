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

    const { data: template } = await supabase
      .from("finding_templates")
      .select("*")
      .eq("id", templateId)
      .eq("inspector_id", user.id)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    await supabase.from("findings").insert({
      inspection_id: inspectionId,
      title: template.title || "Untitled Finding",
      section: template.section || "Inspection Details",
      severity: template.severity || "Recommended Repair",
      observation: template.observation || "",
      implication: template.implication || "",
      recommendation: template.recommendation || "",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to insert template" },
      { status: 500 }
    );
  }
}

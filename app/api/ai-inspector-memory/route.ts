import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

function cleanText(value: any, max = 500) {
  if (!value || typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const triggerText = cleanText(body.triggerText || body.trigger_text || body.title || "");
    const preferredSection = cleanText(body.correctedSection || body.preferred_section || "", 120);
    const preferredSeverity = cleanText(body.correctedSeverity || body.preferred_severity || "", 120);
    const aiSection = cleanText(body.aiSection || body.ai_section || "", 120);
    const aiSeverity = cleanText(body.aiSeverity || body.ai_severity || "", 120);
    const exampleTitle = cleanText(body.title || body.exampleTitle || "", 200);
    const source = cleanText(body.source || "bulk-ai-capture", 120);

    if (!triggerText || !preferredSection) {
      return NextResponse.json(
        { error: "Missing trigger text or preferred section" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("ai_inspector_memory")
      .select("id, correction_count")
      .eq("inspector_id", user.id)
      .eq("trigger_text", triggerText)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("ai_inspector_memory")
        .update({
          preferred_section: preferredSection,
          preferred_severity: preferredSeverity,
          ai_section: aiSection,
          ai_severity: aiSeverity,
          example_title: exampleTitle,
          source,
          correction_count: Number(existing.correction_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("inspector_id", user.id);

      if (error) throw error;

      return NextResponse.json({ success: true, updated: true });
    }

    const { error } = await supabase.from("ai_inspector_memory").insert({
      inspector_id: user.id,
      trigger_text: triggerText,
      preferred_section: preferredSection,
      preferred_severity: preferredSeverity,
      ai_section: aiSection,
      ai_severity: aiSeverity,
      example_title: exampleTitle,
      source,
      correction_count: 1,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, created: true });
  } catch (error: any) {
    console.error("AI inspector memory error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to save inspector memory" },
      { status: 500 }
    );
  }
}

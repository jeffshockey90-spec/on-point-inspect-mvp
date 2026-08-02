import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser, unauthorized } from "../../../lib/apiAuth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { title, observation } = await req.json();

    // Always scope to the authenticated user's own templates. Any body-supplied
    // inspectorId is ignored so a user cannot read another inspector's templates.
    const inspectorId = user.id;

    const { data: templates, error } = await supabase
      .from("finding_templates")
      .select("*")
      .eq("inspector_id", inspectorId);

    if (error) throw error;

    if (!templates?.length) {
      return NextResponse.json({
        matches: [],
      });
    }

    const simplified = templates.map((t) => ({
      id: t.id,
      title: t.title,
      section: t.section,
      severity: t.severity,
      observation: t.observation,
    }));

    const response =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are matching home inspection findings to reusable finding templates. Return only JSON.",
          },
          {
            role: "user",
            content: JSON.stringify({
              currentFinding: {
                title,
                observation,
              },
              templates: simplified,
            }),
          },
        ],
        response_format: {
          type: "json_object",
        },
      });

    const content =
      response.choices[0]?.message?.content || "{}";

    const parsed = JSON.parse(content);

    return NextResponse.json({
      matches: parsed.matches || [],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to match templates" },
      { status: 500 }
    );
  }
}

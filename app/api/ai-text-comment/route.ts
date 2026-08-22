import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "../../../utils/supabase/server";
import { loadFlowStyle } from "../../../lib/ai/flowWriter";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { note } = body;

    if (!note) {
      return NextResponse.json(
        { error: "Missing note" },
        { status: 400 }
      );
    }

    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    // Identify the inspector so the comment matches THEIR voice + learning.
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const { styleGuidance } = await loadFlowStyle({
      userId,
      inspectionId,
      draft: { note, section: body.section ?? null },
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are helping a professional home inspector write concise, realtor-friendly inspection report comments. Return JSON only." +
            (styleGuidance ? "\n\n" + styleGuidance : ""),
        },
        {
          role: "user",
          content: `
Turn this short inspector note into a professional inspection finding:

"${note}"

Return ONLY valid JSON in this format:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Style requirements:
- Professional
- Clear
- Not overly alarming
- Realtor friendly
- Use concise wording
- Do not claim code violations
- Use "appeared" when uncertain
- Recommend qualified contractor when needed
`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to generate AI comment" },
      { status: 500 }
    );
  }
}
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../lib/openai";
import { createClient } from "../../../utils/supabase/server";
import { loadFlowStyle } from "../../../lib/ai/flowWriter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      observation,
      implication,
      recommendation,
    } = body;
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    // Identify the inspector so the rewrite matches THEIR voice + learned edits.
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
      draft: { observation, text: recommendation },
    });

    const prompt = `
You are an expert home inspection report writer.

Rewrite the recommendation below to sound:

- professional
- realtor friendly
- less alarming
- calm and clear
- still technically accurate
- still liability safe

IMPORTANT:
- Do NOT remove important safety information
- Do NOT downplay serious defects
- Do NOT mention being softer
- Keep it concise and professional

Return ONLY the rewritten recommendation text.

Observation:
${observation}

Implication:
${implication}

Recommendation:
${recommendation}
`;

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content:
            "You professionally rewrite home inspection findings." +
            (styleGuidance ? "\n\n" + styleGuidance : ""),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const rewritten =
      response.choices[0]?.message?.content || recommendation;

    return NextResponse.json({
      rewritten,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error: error.message || "Rewrite failed",
      },
      {
        status: 500,
      }
    );
  }
}
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAIModel } from "../../../lib/openai";
import { createClient } from "../../../utils/supabase/server";
import { loadFlowWriter } from "../../../lib/ai/flowWriter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl } = body;
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl" },
        { status: 400 }
      );
    }

    // Identify the inspector from the session so suggestions use THEIR voice,
    // learned edits, and published examples — the shared FLOW Writer.
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

    const { systemPrompt } = await loadFlowWriter({
      userId,
      inspectionId,
      draft: {},
      extra: `INPUT: a single home inspection photo, with no written note — infer the likely finding from the image alone. Only describe defects/conditions the image actually supports; if the image is ambiguous, stay conservative rather than guessing.
- Write as a direct field observation, NOT a narration of a picture. Never reference the photo, image, or camera (no "in this photo", "this image shows", "pictured", "as seen").
Return ONLY valid JSON with keys: section, title, severity, observation, implication, recommendation.`,
    });

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analyze this inspection image and return JSON with section, title, severity, observation, implication, recommendation.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";

    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}

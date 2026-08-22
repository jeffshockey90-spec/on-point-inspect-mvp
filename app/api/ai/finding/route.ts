import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../../lib/openai";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { loadFlowWriter } from "../../../../lib/ai/flowWriter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await request.json();
    const { imageUrl, section, note } = body;
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

    if (!imageUrl && !note) {
      return NextResponse.json(
        { error: "Missing imageUrl or note" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const { systemPrompt } = await loadFlowWriter({
      userId: user.id,
      inspectionId,
      draft: { note: note || null, section: section || null },
      extra: `INPUT: a home inspection photo${
        note ? " plus the inspector's written note" : " (no written note — use the photo only)"
      }, for the ${section || "General"} section.
- Write as a direct field observation, NOT a narration of a picture. Never reference the photo, image, or camera — do not write "in this photo", "this image shows", "pictured", "shown here", "as seen", or similar. Describe the component/condition itself.
- Use phrases like "appeared to be", "was observed", or "at the time of inspection" when appropriate.
- Do not use markdown. Do not include any text outside the JSON.
Return ONLY valid JSON with keys: title, observation, implication, recommendation.`,
    });

    const content: any[] = [
      {
        type: "text",
        text: `
Analyze this home inspection finding for the ${section || "General"} section.

Inspector note:
${note || "No written note provided. Use the photo only."}
`,
      },
    ];

    if (imageUrl) {
      content.push({
        type: "image_url",
        image_url: {
          url: imageUrl,
        },
      });
    }

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.3,
      max_completion_tokens: 900,
    });

    const raw = response.choices[0]?.message?.content || "{}";

    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed: any = {};

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {};
    }

    return NextResponse.json({
      title: parsed.title || "",
      observation: parsed.observation || "",
      implication: parsed.implication || "",
      recommendation: parsed.recommendation || "",
    });
  } catch (error: any) {
    const serviceError = classifyAIServiceError(error);
    return NextResponse.json(
      {
        error: serviceError.message,
        code: serviceError.code,
        retryable: serviceError.retryable,
        retryAfterSeconds: serviceError.retryAfterSeconds,
      },
      { status: serviceError.status }
    );
  }
}
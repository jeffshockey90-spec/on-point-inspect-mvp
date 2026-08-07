import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../../lib/openai";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { imageUrl, section, note } = await request.json();

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

    const content: any[] = [
      {
        type: "text",
        text: `
Analyze this home inspection finding for the ${section || "General"} section.

Inspector note:
${note || "No written note provided. Use the photo only."}

Write a professional, detailed, realtor-friendly home inspection finding.

Return ONLY valid JSON:
{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Rules:
- Do not use markdown.
- Do not overstate.
- Do not claim code violations.
- Do not say something is unsafe unless it is clearly a safety concern.
- Use phrases like "appeared to be", "was observed", or "at the time of inspection" when appropriate.
- Observation should clearly describe the condition of the component itself.
- Write as a direct field observation, NOT a narration of a picture. Never reference the photo, image, or camera — do not write "in this photo", "this image shows", "pictured", "shown here", "as seen", or similar. Describe the component/condition, not the image.
- Implication should explain why it matters and what could happen if ignored.
- Recommendation should recommend evaluation, repair, or correction by the proper qualified contractor when appropriate.
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
          content:
            "You are a senior certified home inspector writing professional inspection report comments. Return only valid JSON.",
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
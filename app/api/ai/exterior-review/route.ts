import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing" },
        { status: 500 }
      );
    }

    const body = await request.json();

    if (!body.imageUrl) {
      return NextResponse.json(
        { error: "imageUrl required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content: `
You are assisting a professional home inspector.

Analyze ONLY visible exterior features conservatively.

Return ONLY valid JSON.

Use this exact format:

{
  "house_style": "",
  "roof_style": "",
  "garage": ""
}

garage must be either "Yes", "No", or "Unknown".

Allowed house styles:
Ranch
Colonial
Cape Cod
Split Foyer
Bi-Level
Townhouse
Duplex
Two Story
Manufactured
Unknown

Allowed roof styles:
Gable
Hip
Flat
Gambrel
Mansard
Shed
Combination
Unknown
`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this exterior home image." },
            {
              type: "image_url",
              image_url: { url: body.imageUrl },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "{}";

    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    console.log(error);

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
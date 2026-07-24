import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../../lib/openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const imageUrl = body.imageUrl || body.image_url;

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content:
            "You are a professional home inspection assistant. Return ONLY valid JSON. No markdown. No extra text.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze this home inspection image.

Return ONLY this JSON:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Rules:
- concise
- factual
- professional
- realtor friendly
- non-alarmist
- do not claim code violations
- do not exaggerate
`,
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
      max_completion_tokens: 600,
    });

    const rawText = response.choices[0]?.message?.content || "{}";

    let parsed: any = {};

    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {
        title: "",
        observation: rawText,
        implication: "",
        recommendation: "",
      };
    }

    return NextResponse.json({
      success: true,
      title: parsed.title || "",
      observation: parsed.observation || "",
      implication: parsed.implication || "",
      recommendation: parsed.recommendation || "",
    });
  } catch (error: any) {
    console.error("OpenAI Vision Error:", error);

    return NextResponse.json(
      {
        error: error?.message || "AI analysis failed",
      },
      { status: 500 }
    );
  }
}
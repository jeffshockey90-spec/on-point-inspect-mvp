import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAIModel } from "../../../lib/openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content:
            "You are a professional home inspection assistant. Analyze inspection photos and suggest likely findings in JSON format.",
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

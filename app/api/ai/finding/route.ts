import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { imageUrl, section } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write concise, factual, realtor-friendly home inspection comments. Return only valid JSON. Do not overstate. Do not claim code violations.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this inspection photo for the ${section} section.

Return only this JSON:
{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}`,
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
      max_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();

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
    return NextResponse.json(
      { error: error.message || "AI finding failed" },
      { status: 500 }
    );
  }
}
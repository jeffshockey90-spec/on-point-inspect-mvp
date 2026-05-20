import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl" },
        { status: 400 }
      );
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
            "You are analyzing a residential property photo for home inspection software. Return only valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze the visible house photo and return only JSON:
{
  "houseStyle": "Ranch, Colonial, Cape Cod, Split-Level, Contemporary, Townhouse, or Other",
  "roofStyle": "Gable, Hip, Flat, Shed, Mansard, Gambrel, or Combination",
  "garage": "Yes or No"
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
      max_tokens: 300,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        houseStyle: "",
        roofStyle: "",
        garage: "",
      };
    }

    return NextResponse.json({
      houseStyle: parsed.houseStyle || "",
      roofStyle: parsed.roofStyle || "",
      garage: parsed.garage || "",
    });
  } catch (error: any) {
    console.error("PROPERTY STYLE ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Property style analysis failed",
      },
      { status: 500 }
    );
  }
}
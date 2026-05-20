import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageUrl = body.imageUrl;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },

      messages: [
        {
          role: "system",
          content:
            "You help a professional home inspector read HVAC and appliance data plates. Return JSON only.",
        },

        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Read this equipment data plate photo.

Return ONLY valid JSON in this exact format:

{
  "title": "",
  "brand": "",
  "model": "",
  "serial": "",
  "equipment_type": "",
  "manufacture_date": "",
  "estimated_age": "",
  "capacity": "",
  "fuel_type": "",
  "voltage": "",
  "amperage": "",
  "refrigerant": "",
  "efficiency": "",
  "notes": ""
}
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
      {
        error: "Failed to scan data plate",
      },
      {
        status: 500,
      }
    );
  }
}
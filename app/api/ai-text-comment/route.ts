import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { note } = await req.json();

    if (!note) {
      return NextResponse.json(
        { error: "Missing note" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are helping a professional home inspector write concise, realtor-friendly inspection report comments. Return JSON only.",
        },
        {
          role: "user",
          content: `
Turn this short inspector note into a professional inspection finding:

"${note}"

Return ONLY valid JSON in this format:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Style requirements:
- Professional
- Clear
- Not overly alarming
- Realtor friendly
- Use concise wording
- Do not claim code violations
- Use "appeared" when uncertain
- Recommend qualified contractor when needed
`,
        },
      ],
      response_format: { type: "json_object" },
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
      { error: "Failed to generate AI comment" },
      { status: 500 }
    );
  }
}
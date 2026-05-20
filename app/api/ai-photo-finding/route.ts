import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `
Analyze this inspection photo and return JSON:

Image: ${imageUrl}

Return:
{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "section": ""
}
`,
        },
      ],
    });

    const text = response.choices[0].message.content || "{}";

    return NextResponse.json(JSON.parse(text));
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
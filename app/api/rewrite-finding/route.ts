import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const {
      observation,
      implication,
      recommendation,
    } = await req.json();

    const prompt = `
You are an expert home inspection report writer.

Rewrite the recommendation below to sound:

- professional
- realtor friendly
- less alarming
- calm and clear
- still technically accurate
- still liability safe

IMPORTANT:
- Do NOT remove important safety information
- Do NOT downplay serious defects
- Do NOT mention being softer
- Keep it concise and professional

Return ONLY the rewritten recommendation text.

Observation:
${observation}

Implication:
${implication}

Recommendation:
${recommendation}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You professionally rewrite home inspection findings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const rewritten =
      response.choices[0]?.message?.content || recommendation;

    return NextResponse.json({
      rewritten,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error: error.message || "Rewrite failed",
      },
      {
        status: 500,
      }
    );
  }
}
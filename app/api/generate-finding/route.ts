import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function safeParseAI(input: string) {
  const cleaned = input
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);

  if (match) {
    return JSON.parse(match[0]);
  }

  throw new Error("AI returned invalid JSON");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { note, section } = body;

    if (!note || note.trim() === "") {
      return NextResponse.json(
        { error: "Inspector note is required" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector writing professional inspection findings.

Return ONLY valid JSON.

Write clear, detailed, professional, realtor-friendly findings.

Do not use markdown.
Do not include text outside JSON.
          `,
        },
        {
          role: "user",
          content: `
Create a detailed home inspection finding.

SECTION:
${section}

INSPECTOR NOTE:
${note}

Return ONLY this JSON format:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "section": "${section}"
}

Rules:
- Title should be short and professional.
- Observation should describe what was seen.
- Implication should explain why it matters.
- Recommendation should explain what should be done.
          `,
        },
      ],
      temperature: 0.5,
    });

    const text = response.choices[0].message.content || "";

    const parsed = safeParseAI(text);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("AI ROUTE ERROR:", err);

    return NextResponse.json(
      {
        error: err.message || "Server error",
      },
      { status: 500 }
    );
  }
}
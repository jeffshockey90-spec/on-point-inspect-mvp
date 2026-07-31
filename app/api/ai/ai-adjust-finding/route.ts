import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();

    const {
      note,
      title,
      observation,
      implication,
      recommendation,
      section,
    } = body;

    if (!note) {
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
          content:
            "You are a home inspection report writer. Return ONLY JSON.",
        },
        {
          role: "user",
          content: `
Rewrite this inspection finding based on the note.

NOTE:
${note}

CURRENT:
Title: ${title}
Observation: ${observation}
Implication: ${implication}
Recommendation: ${recommendation}
Section: ${section}

Return JSON:
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
      temperature: 0.4,
    });

    const text = response.choices[0].message.content || "{}";

    // SAFE JSON PARSE (IMPORTANT)
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("AI ROUTE ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
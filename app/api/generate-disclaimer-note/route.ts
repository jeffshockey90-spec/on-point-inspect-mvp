import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { topic, notes } = await req.json();

    if (!topic || !notes) {
      return NextResponse.json(
        { error: "Missing topic or notes." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const prompt = `
You are writing a professional home inspection report disclaimer.

Disclaimer topic:
${topic}

Inspector notes:
${notes}

Write a concise, professional disclaimer suitable for a residential home inspection report.

Requirements:
- Use plain language.
- Do not overstate.
- Do not give legal advice.
- Do not claim code compliance.
- Do not claim the inspector tested or confirmed anything unless the notes say so.
- Make clear that the inspection is visual and non-invasive when relevant.
- Recommend proper specialist evaluation/testing only when appropriate.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You write concise, professional home inspection report disclaimers.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.25,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "AI request failed." },
        { status: 500 }
      );
    }

    const disclaimer =
      data?.choices?.[0]?.message?.content?.trim() ||
      "This item was not fully evaluated as part of this visual, non-invasive inspection.";

    return NextResponse.json({ disclaimer });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate disclaimer." },
      { status: 500 }
    );
  }
}

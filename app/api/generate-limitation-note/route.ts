import { NextResponse } from "next/server";
import { getAIModel } from "../../../lib/openai";

export async function POST(req: Request) {
  try {
    const { section, notes, selectedLimitations } = await req.json();

    if (!notes) {
      return NextResponse.json(
        { error: "Missing limitation notes." },
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
You are writing a professional home inspection report limitation comment.

Section: ${section || "Unknown"}

Selected limitation conditions:
${Array.isArray(selectedLimitations) && selectedLimitations.length > 0
  ? selectedLimitations.join(", ")
  : "None selected"}

Inspector rough note:
${notes}

Write one concise, clear limitation comment in a professional home inspection style.
Do not overstate. Do not mention code compliance. Do not say the inspector was negligent.
Explain that visibility/access/operation was limited and recommend further evaluation only when appropriate.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getAIModel(),
        messages: [
          {
            role: "system",
            content:
              "You write concise professional limitation comments for home inspection reports.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "AI request failed." },
        { status: 500 }
      );
    }

    const comment =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Inspection of this area was limited at the time of inspection.";

    return NextResponse.json({ comment });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate limitation note." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { section, title, type, notes, selectedOptions } =
      await req.json();

    if (!notes || !String(notes).trim()) {
      return NextResponse.json(
        { error: "Missing AI notes." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in .env.local." },
        { status: 500 }
      );
    }

    const isDisclaimer =
      type === "ai-notes" || section === "Disclaimers";

    const isLimitation = String(title || "")
      .toLowerCase()
      .includes("limitations");

    const task = isDisclaimer
      ? "Write a professional home inspection report disclaimer."
      : isLimitation
      ? "Write a professional home inspection limitation statement."
      : "Write a professional home inspection report note.";

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      40000
    );

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "You are a senior certified home inspector writing detailed professional home inspection report language. Expand short inspector notes into full, polished, client-facing disclaimers and limitation statements. The writing should sound professional, thorough, legally protective, and realtor-friendly. Explain what was observed, what could not be determined, why the limitation or disclaimer matters, and recommend further evaluation when appropriate. Do not claim code compliance. Do not use bullet points. Return only the final paragraph with no labels or markdown.",
            },
            {
              role: "user",
              content: `
Task:
${task}

Section:
${section || ""}

Checklist Title:
${title || ""}

Selected Options:
${(selectedOptions || []).join(", ")}

Inspector AI Notes:
${notes}

Write one detailed, expanded, professional report-ready paragraph.
              `.trim(),
            },
          ],
        }),
      }
    ).finally(() => clearTimeout(timeout));

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "OpenAI request failed.",
        },
        { status: response.status }
      );
    }

    const generatedText =
      data?.choices?.[0]?.message?.content?.trim();

    if (!generatedText) {
      return NextResponse.json(
        { error: "OpenAI returned no text." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      text: generatedText,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return NextResponse.json(
        { error: "OpenAI request timed out." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to generate report note.",
      },
      { status: 500 }
    );
  }
}
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID" },
        { status: 400 }
      );
    }

    const { data: findings } = await supabase
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId);

    if (!findings || findings.length === 0) {
      return NextResponse.json(
        { error: "No findings found" },
        { status: 400 }
      );
    }

    const findingsText = findings
      .map(
        (f: any) => `
Title: ${f.title}

Observation:
${f.observation}

Implication:
${f.implication}

Recommendation:
${f.recommendation}
`
      )
      .join("\n\n");

    const prompt = `
You are an expert home inspector.

Generate a professional executive summary for a home inspection report.

The summary should include:

1. Overall Condition
2. Major Concerns
3. Maintenance Items
4. Positive Attributes
5. Recommended Next Steps

The tone should be:
- professional
- balanced
- realtor friendly
- technically accurate
- easy for clients to understand

Do not exaggerate issues.
Do not use alarming wording.
Do not use bullet spam.

Return clean formatted text.

Inspection Findings:
${findingsText}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate executive summaries for home inspections.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const summary =
      response.choices[0]?.message?.content || "";

    await supabase
      .from("inspections")
      .update({
        executive_summary: summary,
      })
      .eq("id", inspectionId);

    return NextResponse.json({
      summary,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error: error.message || "Failed to generate summary",
      },
      {
        status: 500,
      }
    );
  }
}
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { findings } = await req.json();

    if (!findings || !Array.isArray(findings)) {
      return NextResponse.json(
        { error: "Missing findings" },
        { status: 400 }
      );
    }

    const findingsText = findings
      .map(
        (finding: any, index: number) => `
Finding ${index + 1}
Section: ${finding.section || ""}
Title: ${finding.title || ""}
Observation: ${finding.observation || ""}
Implication: ${finding.implication || ""}
Recommendation: ${finding.recommendation || ""}
`
      )
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help a professional home inspector create concise, realtor-friendly report summaries. Return JSON only.",
        },
        {
          role: "user",
          content: `
Create a home inspection report summary from these findings:

${findingsText}

Return ONLY valid JSON:

{
  "major_concerns": "",
  "safety_concerns": "",
  "maintenance_items": "",
  "overall_summary": ""
}

Rules:
- Be professional and non-alarmist.
- Do not say the house passed or failed.
- Do not advise whether the client should buy the house.
- Group serious items under major concerns.
- Group safety-related items under safety concerns.
- Group routine repair/upkeep items under maintenance items.
- Keep it client/realtor friendly.
- Use short paragraphs or bullet-style lines.
`,
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
      { error: "Failed to generate report summary" },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "../../../utils/supabase/server";
import { loadFlowStyle } from "../../../lib/ai/flowWriter";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { findings } = body;
    const inspectionId = body.inspectionId ?? body.inspection_id ?? null;

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

    // Identify the inspector so the summary matches THEIR voice + learned tone
    // (voice only — finding few-shot examples would mislead a summary).
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const { styleGuidance } = await loadFlowStyle({
      userId,
      inspectionId,
      draft: { text: findingsText },
      includeExamples: false,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help a professional home inspector create concise, realtor-friendly report summaries. Return JSON only." +
            (styleGuidance ? "\n\n" + styleGuidance : ""),
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
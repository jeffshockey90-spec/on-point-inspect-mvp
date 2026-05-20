import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =========================
   SAFE JSON PARSER
========================= */
function safeParseAI(input: string) {
  try {
    return JSON.parse(input);
  } catch {}

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
    console.log("🔥 AI ROUTE HIT");

    const body = await req.json();

    const {
      note,
      title,
      observation,
      implication,
      recommendation,
      section,
    } = body;

    if (!note || note.trim() === "") {
      return NextResponse.json(
        { error: "Inspector note is required" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are a SENIOR LICENSED HOME INSPECTOR writing structured, detailed inspection reports.

You MUST ALWAYS return highly structured results.

ABSOLUTE RULES:
- Never write short answers
- Each section must be 4–7 full sentences minimum
- Do NOT mix sections together
- Be extremely descriptive and professional
- Use inspection-report tone

STRUCTURE YOU MUST FOLLOW:

OBSERVATION:
- What is physically seen
- Location, condition, materials
- Visible defects or conditions
- Be factual and detailed

IMPLICATION:
- Why the condition matters
- Risks or potential failure
- Safety or property concerns
- What could happen if ignored

RECOMMENDATION:
- What should be done
- Who should repair it (type of professional)
- Corrective actions
- Best practice guidance

Return ONLY valid JSON.
          `,
        },
        {
          role: "user",
          content: `
Rewrite this inspection finding into a fully structured professional report.

INSPECTOR NOTE:
${note}

CURRENT FINDING:

Title: ${title}
Observation: ${observation}
Implication: ${implication}
Recommendation: ${recommendation}
Section: ${section}

STRICT OUTPUT RULES:
- Expand each field into 4–7 sentences minimum
- Observation = ONLY physical description
- Implication = ONLY risk + meaning + consequences
- Recommendation = ONLY corrective actions
- Do NOT combine sections
- Do NOT shorten responses

Return ONLY JSON:

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
      temperature: 0.7,
    });

    const text = response.choices[0].message.content || "";

    console.log("🤖 RAW AI RESPONSE:", text);

    const parsed = safeParseAI(text);

    console.log("✅ FINAL PARSED RESULT:", parsed);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("❌ AI ROUTE ERROR:", err);

    return NextResponse.json(
      {
        error: err.message || "Server error",
      },
      { status: 500 }
    );
  }
}
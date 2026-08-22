import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { getAIModel } from "../../../../lib/openai";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AHJ_DISCLAIMER =
  "Requirements vary by jurisdiction and by the code edition (and any local amendments) each area has adopted. Always confirm the specific numbers with the local authority having jurisdiction (AHJ) before citing them in a report.";

const SYSTEM_PROMPT = `You are Code Assistant, a knowledgeable building-code reference helper for a professional home inspector working in the field.

Your job: answer the inspector's code/standards question concisely and practically, the way an experienced inspector or plan reviewer would explain it to a colleague.

How to answer:
- Lead with the common requirement — the actual numbers and dimensions (heights, clearances, spacing, sizes) an inspector needs.
- When you are confident, reference the relevant model-code section by topic, e.g. "IRC R311.7 (stairways)" or "IRC E3902 (GFCI protection)". Use the International Residential Code (IRC) as the general model-code frame of reference unless the inspector names another code.
- Note the common exceptions or gotchas that trip inspectors up.
- Keep it tight and scannable. Short paragraphs or a few bullets. Plain language, not legalese.

Hard rules:
- You are a reference aid, NOT a source of legal advice or a code official's ruling. Do not tell the inspector something "is a violation" — describe what the model code commonly requires and let them verify.
- NEVER invent or guess a specific code section number. If you are not sure of the exact citation, say so plainly and give the general guidance without a fabricated citation.
- Codes differ by adopted edition and local amendments. You MUST end EVERY answer with a clear reminder to verify with the local authority having jurisdiction (AHJ). Use wording equivalent to: "${AHJ_DISCLAIMER}"
- If the question is not about building codes, standards, or inspection practice, briefly say that's outside your scope and steer back — but still keep it friendly.

Format: plain text or light markdown (bold, simple bullets). No headings larger than bold labels.`;

function cleanString(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const question = cleanString(body.question);
    const context = cleanString(body.context);

    if (!question) {
      return NextResponse.json(
        { error: "Ask a code question to get started." },
        { status: 400 },
      );
    }

    const userContent = context
      ? `Inspector's question:\n${question}\n\nContext from the current inspection (optional, may be empty):\n${context}`
      : `Inspector's question:\n${question}`;

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    let answer = cleanString(response.choices[0]?.message?.content);

    if (!answer) {
      return NextResponse.json(
        { error: "No answer was generated. Try rephrasing the question." },
        { status: 502 },
      );
    }

    // Safety net: guarantee the AHJ disclaimer is always present, even if the
    // model omitted it, so no answer ever ships without the jurisdiction caveat.
    if (!/authority having jurisdiction|\bAHJ\b/i.test(answer)) {
      answer = `${answer}\n\n${AHJ_DISCLAIMER}`;
    }

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("Code Assistant error:", error);

    const classified = classifyAIServiceError(error);

    return NextResponse.json(
      {
        error: classified.message,
        title: classified.title,
        code: classified.code,
        retryable: classified.retryable,
        retryAfterSeconds: classified.retryAfterSeconds,
      },
      { status: classified.status },
    );
  }
}

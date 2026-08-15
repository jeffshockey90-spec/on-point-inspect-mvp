import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../../lib/openai";
import { getSessionUser } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function clean(v: any) {
  return String(v ?? "").trim();
}

function serviceLabel(serviceType: string) {
  return String(serviceType || "home_inspection")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Named standard clauses the "Insert clause" control can generate.
const CLAUSE_PROMPTS: Record<string, string> = {
  arbitration:
    "a binding arbitration / dispute-resolution clause requiring disputes be resolved by arbitration",
  limitation_of_liability:
    "a limitation-of-liability clause capping liability at the inspection fee and excluding consequential damages",
  scope_and_exclusions:
    "a scope-of-work and exclusions clause describing what the inspection does and does not cover",
  mold_disclaimer:
    "a mold-testing disclaimer clause noting sampling limitations and that results reflect conditions at the time of testing",
  radon_disclosure:
    "a radon-testing disclosure clause referencing EPA action levels and test-condition requirements (closed-building conditions)",
  payment_terms:
    "a payment-terms clause stating the fee ({{INSPECTION_FEE}}) is due at or before the inspection and the report may be withheld until paid",
  confidentiality:
    "a confidentiality clause stating the report is for the client's sole use and not transferable without written consent",
  standards_of_practice:
    "a standards-of-practice clause stating the inspection is performed in accordance with the applicable state standards of practice and the InterNACHI/ASHI standards",
};

const BASE_RULES = `
Write in clear, professional, legally-styled home-inspection agreement language.
Use plain text only: no markdown, no asterisks, no code fences. Use numbered or
titled sections where appropriate.
Where a value would be personalized, use these merge placeholders verbatim (do NOT
invent names): {{CLIENT_NAME}}, {{PROPERTY_ADDRESS}}, {{INSPECTION_FEE}},
{{INSPECTION_DATE}}, {{INSPECTOR_COMPANY}}, {{INSPECTOR_NAME}}, {{AGREEMENT_STATE}}.
Keep the tone firm but not alarmist. Do not fabricate statutes or license numbers.`;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = clean(body.mode) || "draft";
    const serviceType = clean(body.serviceType) || "home_inspection";
    const state = (clean(body.state) || "the applicable state").toUpperCase();
    const title = clean(body.title);
    const instruction = clean(body.instruction);
    const existingBody = clean(body.existingBody);
    const clause = clean(body.clause);

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === "improve") {
      if (!existingBody) {
        return NextResponse.json({ error: "Nothing to improve yet." }, { status: 400 });
      }
      systemPrompt = `You revise home-inspection service agreements.${BASE_RULES}
Preserve every existing merge placeholder. Keep all substantive legal protections
intact — you may improve clarity and structure but must not weaken the inspector's
protections or remove required clauses.`;
      userPrompt = `Revise the agreement below per the instruction, and return the COMPLETE revised agreement text only.

Instruction: ${instruction || "Improve clarity and professionalism without changing the legal meaning."}

--- CURRENT AGREEMENT ---
${existingBody}`;
    } else if (mode === "clause") {
      const clauseSpec = CLAUSE_PROMPTS[clause] || clause || "a standard clause";
      systemPrompt = `You draft individual clauses for home-inspection service agreements.${BASE_RULES}
Return ONLY the single clause (a short section heading followed by its text) — no
preamble, no surrounding agreement.`;
      userPrompt = `Draft ${clauseSpec} for a ${serviceLabel(serviceType)} agreement in ${state}.`;
    } else {
      systemPrompt = `You draft complete home-inspection service agreements.${BASE_RULES}
Produce a full, ready-to-use agreement for the given service and state, including:
parties and property; scope of the service; standards of practice; limitations and
exclusions; dispute resolution / arbitration; limitation of liability (capped at the
fee); payment terms using {{INSPECTION_FEE}}; confidentiality / non-transferability;
electronic delivery and signature; entire-agreement; and a signature block.
End with a brief line advising the inspector to have the agreement reviewed by a
licensed attorney in their state.`;
      userPrompt = `Draft a complete ${serviceLabel(serviceType)} agreement for ${state}.${
        title ? ` Title it "${title}".` : ""
      }`;
    }

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    });

    const text = clean(response.choices[0]?.message?.content);
    if (!text) {
      return NextResponse.json({ error: "The AI returned nothing. Try again." }, { status: 502 });
    }

    return NextResponse.json({ body: text });
  } catch (error: any) {
    console.error("draft-agreement error:", error);
    return NextResponse.json(
      { error: error?.message || "AI drafting failed." },
      { status: 500 },
    );
  }
}

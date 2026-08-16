import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAIModel } from "../../../../lib/openai";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";
import { buildWritingStyleInstructions } from "../../../../lib/ai/writingStyle";
import { loadWritingConfigForInspection } from "../../../../lib/ai/loadWritingConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function clean(v: any) {
  return String(v ?? "").trim();
}

// Draft a short, client-friendly statement explaining that a set of linked
// findings may be related, so the report tells the bigger-picture story.
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const hint = clean(body?.hint).slice(0, 500);
    const findingIds = Array.from(
      new Set(
        (Array.isArray(body?.findingIds) ? body.findingIds : [])
          .map((id: any) => clean(id))
          .filter(Boolean),
      ),
    );

    if (!inspectionId || findingIds.length < 2) {
      return NextResponse.json(
        { error: "Select at least two findings to relate." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const { data: findings } = await admin
      .from("findings")
      .select("id, title, section, severity, observation, implication, recommendation")
      .eq("inspection_id", inspectionId)
      .in("id", findingIds);

    if (!findings || findings.length < 2) {
      return NextResponse.json(
        { error: "Could not load the selected findings." },
        { status: 400 },
      );
    }

    const findingsBlock = findings
      .map(
        (f: any, i: number) =>
          `Finding ${i + 1} — Section: ${clean(f.section) || "Unknown"}; Severity: ${
            clean(f.severity) || "Unknown"
          }; Title: ${clean(f.title) || "Untitled"}\nObservation: ${
            clean(f.observation) || "None"
          }`,
      )
      .join("\n\n");

    const writingConfig = await loadWritingConfigForInspection(inspectionId);
    const styleBlock = buildWritingStyleInstructions(writingConfig);

    const systemPrompt = `You are a senior home inspector writing a short "related observations" note for a client report.
The inspector has linked the findings below because they believe the conditions may share a common cause (for example, an exterior gap and interior cracks in the same area suggesting differential movement).

Write ONE short paragraph (2-4 sentences) that:
- Names the related conditions and where they are, in plain client-friendly language.
- States they MAY be related and what that could indicate, using cautious wording (may, could, appears) -- never state a concealed cause as fact.
- Recommends evaluation by the appropriate qualified professional to determine the cause and significance when the relationship suggests a structural or safety concern.
- Is calm and factual, not alarmist. No markdown, no bullet points, no heading. Plain text only.

${styleBlock}`;

    const userPrompt = `Linked findings:

${findingsBlock}

Inspector's note on why they're related (optional): ${hint || "None provided — infer the likely relationship from the findings."}

Write the related-observations note.`;

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
    });

    const note = clean(response.choices[0]?.message?.content);
    if (!note) {
      return NextResponse.json({ error: "The AI returned nothing. Try again." }, { status: 502 });
    }

    return NextResponse.json({ note });
  } catch (error: any) {
    console.error("link-findings-note error:", error);
    return NextResponse.json(
      { error: error?.message || "AI note drafting failed." },
      { status: 500 },
    );
  }
}

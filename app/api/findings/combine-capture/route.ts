import { NextResponse } from "next/server";
import OpenAI from "openai";
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

// Same 6-level severity set the app uses everywhere; index = seriousness.
const SEVERITY_ORDER = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

function clean(v: any) {
  return String(v ?? "").trim();
}

function severityRank(value: any) {
  const idx = SEVERITY_ORDER.indexOf(clean(value));
  return idx < 0 ? 3 : idx; // default to "Recommended Repair"
}

// Merge a NEW field capture into an EXISTING finding (the report-builder "Combine
// Defects" behaviour, but for a live capture + an existing finding instead of
// several existing rows). The existing finding is rewritten to cover BOTH the
// original location and the new one, keeping the most serious severity. Photos
// are attached separately by the field tool; this only rewrites the narrative.
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const findingId = clean(body?.findingId || body?.finding_id);
    const incoming = body?.newFinding || body?.capture || {};

    if (!inspectionId || !findingId) {
      return NextResponse.json(
        { error: "Missing inspectionId or findingId." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const { data: target, error: targetError } = await admin
      .from("findings")
      .select("*")
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) {
      return NextResponse.json({ error: "Existing finding not found." }, { status: 404 });
    }

    const mergedSeverity =
      SEVERITY_ORDER[
        Math.max(severityRank(target.severity), severityRank(incoming.severity))
      ] || clean(target.severity) || "Recommended Repair";

    const writingConfig = await loadWritingConfigForInspection(inspectionId);
    const styleBlock = buildWritingStyleInstructions(writingConfig);

    const systemPrompt = `You merge a NEW inspection observation into an EXISTING finding that describes the SAME kind of defect found at ANOTHER location, producing ONE combined finding.
Rules:
- Keep every fact from BOTH the existing finding and the new observation. Do not invent, exaggerate, or drop any defect or location.
- The combined finding MUST name every affected location/area from both.
- Use the most serious severity of the two (${mergedSeverity}).
- Keep it professional, accurate, and liability-safe.

${styleBlock}

Return ONLY valid JSON: {"title":"","observation":"","implication":"","recommendation":""}`;

    const userPrompt = `EXISTING finding (already in the report):
Section: ${clean(target.section) || "?"}${target.location ? `, Location: ${clean(target.location)}` : ""}, Severity: ${clean(target.severity) || "?"}
Title: ${clean(target.title)}
Observation: ${clean(target.observation)}
Implication: ${clean(target.implication)}
Recommendation: ${clean(target.recommendation)}

NEW observation just captured in the field (merge this in):
Section: ${clean(incoming.section) || clean(target.section) || "?"}${incoming.location ? `, Location: ${clean(incoming.location)}` : ""}, Severity: ${clean(incoming.severity) || "?"}
Title: ${clean(incoming.title)}
Observation: ${clean(incoming.observation)}
Implication: ${clean(incoming.implication)}
Recommendation: ${clean(incoming.recommendation)}

Rewrite the EXISTING finding into one combined finding that covers both.`;

    const aiResponse = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(aiResponse.choices[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    const updatePayload: Record<string, any> = {
      title: clean(parsed.title) || clean(target.title),
      severity: mergedSeverity,
      observation: clean(parsed.observation) || clean(target.observation),
      implication: clean(parsed.implication) || clean(target.implication),
      recommendation: clean(parsed.recommendation) || clean(target.recommendation),
    };

    const { data: updated, error: updateError } = await admin
      .from("findings")
      .update(updatePayload)
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .select("id, title, section, severity, observation, implication, recommendation")
      .maybeSingle();
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, finding: updated });
  } catch (error: any) {
    console.error("Combine-capture error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to combine into the existing finding." },
      { status: 500 },
    );
  }
}

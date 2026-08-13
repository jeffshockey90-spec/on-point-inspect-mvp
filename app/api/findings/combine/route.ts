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

// Combine several findings of the same defect (found at different locations)
// into ONE finding. The AI rewrites a single narrative that names every
// location; all photos from the merged findings move onto the surviving one and
// the others are deleted.
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const rawIds: any[] = Array.isArray(body?.findingIds) ? body.findingIds : [];
    const findingIds = Array.from(new Set(rawIds.map((id) => clean(id)).filter(Boolean)));

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }
    if (findingIds.length < 2) {
      return NextResponse.json(
        { error: "Select at least two defects to combine." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Only combine findings that actually belong to this inspection.
    const { data: findings, error: findingsError } = await admin
      .from("findings")
      .select("*")
      .in("id", findingIds)
      .eq("inspection_id", inspectionId);

    if (findingsError) throw findingsError;

    const rows = findings || [];
    if (rows.length < 2) {
      return NextResponse.json(
        { error: "Could not find the selected defects on this report." },
        { status: 400 },
      );
    }

    // The surviving finding is the most serious one (keeps the strongest
    // severity); ties keep the earliest so its photos/order are preserved.
    const target = [...rows].sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    )[0];
    const mergedSeverity =
      SEVERITY_ORDER[Math.max(...rows.map((r: any) => severityRank(r.severity)))] ||
      clean(target.severity) ||
      "Recommended Repair";
    const otherIds = rows.map((r: any) => r.id).filter((id: any) => id !== target.id);

    // On-brand wording (company AI Writing Studio settings).
    const writingConfig = await loadWritingConfigForInspection(inspectionId);
    const styleBlock = buildWritingStyleInstructions(writingConfig);

    const systemPrompt = `You merge several home inspection findings that describe the SAME kind of defect found at DIFFERENT locations into ONE combined finding.
Rules:
- Keep every fact. Do not invent, exaggerate, or drop any defect or location.
- The combined finding MUST name every affected location/area.
- Use the most serious severity among the inputs (${mergedSeverity}).
- Keep it professional, accurate, and liability-safe.

${styleBlock}

Return ONLY valid JSON: {"title":"","observation":"","implication":"","recommendation":""}`;

    const userPrompt = `Merge these ${rows.length} findings into ONE finding that covers all locations:

${rows
      .map((f: any, i: number) => {
        const loc = clean(f.location);
        return `Finding ${i + 1} — Section: ${clean(f.section) || "?"}${
          loc ? `, Location: ${loc}` : ""
        }, Severity: ${clean(f.severity) || "?"}
Title: ${clean(f.title)}
Observation: ${clean(f.observation)}
Implication: ${clean(f.implication)}
Recommendation: ${clean(f.recommendation)}`;
      })
      .join("\n\n")}`;

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
      title: clean(parsed.title) || clean(target.title) || "Combined finding",
      severity: mergedSeverity,
      observation: clean(parsed.observation) || clean(target.observation),
      implication: clean(parsed.implication) || clean(target.implication),
      recommendation: clean(parsed.recommendation) || clean(target.recommendation),
    };

    // 1) Move every photo from the merged findings onto the surviving finding.
    if (otherIds.length) {
      const { error: movePhotosError } = await admin
        .from("photos")
        .update({ finding_id: target.id })
        .in("finding_id", otherIds)
        .eq("inspection_id", inspectionId);
      if (movePhotosError) throw movePhotosError;
    }

    // 2) Rewrite the surviving finding with the combined narrative.
    const { data: updated, error: updateError } = await admin
      .from("findings")
      .update(updatePayload)
      .eq("id", target.id)
      .eq("inspection_id", inspectionId)
      .select("id, title, section, severity, observation, implication, recommendation")
      .maybeSingle();
    if (updateError) throw updateError;

    // 3) Delete the now-merged findings.
    if (otherIds.length) {
      const { error: deleteError } = await admin
        .from("findings")
        .delete()
        .in("id", otherIds)
        .eq("inspection_id", inspectionId);
      if (deleteError) throw deleteError;
    }

    return NextResponse.json({
      ok: true,
      finding: updated,
      combinedCount: rows.length,
      keptId: target.id,
      removedIds: otherIds,
    });
  } catch (error: any) {
    console.error("Combine findings error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to combine defects." },
      { status: 500 },
    );
  }
}

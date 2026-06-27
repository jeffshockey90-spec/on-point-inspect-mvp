import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import {
  inspectionBrain,
  qualityControl,
  aiContext,
  promptEngine,
} from "../../../../lib/ai";
import { getAIModel, getAIVersion } from "../../../../lib/openai";
import { logAIEvent } from "../../../../lib/logging";

export const runtime = "nodejs";

const AI_MODEL = getAIModel();
const AI_VERSION = getAIVersion("report-review");

function cleanText(value: any) {
  return String(value || "").trim();
}

function normalizeInspectionId(value: any) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function safeArray(value: any) {
  return Array.isArray(value) ? value : [];
}

export async function POST(req: Request) {
  let inspectionId: number | null = null;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    inspectionId = normalizeInspectionId(
      body.inspectionId || body.inspection_id || body.id
    );

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .maybeSingle();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const [{ data: findings }, { data: equipment }, { data: photos }] =
      await Promise.all([
        supabase
          .from("findings")
          .select(
            "id,title,section,severity,observation,implication,recommendation,image_url"
          )
          .eq("inspection_id", inspectionId),
        supabase
          .from("equipment_inventory")
          .select(
            "id,equipment_type,manufacturer,model,serial,condition,equipment_status"
          )
          .eq("inspection_id", inspectionId),
        supabase
          .from("photos")
          .select("id,finding_id,public_url,file_path")
          .eq("inspection_id", inspectionId),
      ]);

    const baseReview = qualityControl.reviewReport({
      findings: safeArray(findings),
      equipment: safeArray(equipment),
    });

    const context = await aiContext.load(inspectionId);

    const findingsSummary = safeArray(findings)
      .map((finding: any) => {
        return [
          `ID: ${finding.id}`,
          `Section: ${cleanText(finding.section) || "Unknown"}`,
          `Severity: ${cleanText(finding.severity) || "Unknown"}`,
          `Title: ${cleanText(finding.title) || "Untitled"}`,
          `Observation: ${cleanText(finding.observation) || "Blank"}`,
          `Implication: ${cleanText(finding.implication) || "Blank"}`,
          `Recommendation: ${cleanText(finding.recommendation) || "Blank"}`,
          `Main photo: ${finding.image_url ? "Yes" : "No"}`,
        ].join("\n");
      })
      .join("\n\n---\n\n");

    const equipmentSummary = safeArray(equipment)
      .map((item: any) => {
        return [
          `Equipment Type: ${cleanText(item.equipment_type) || "Unknown"}`,
          `Manufacturer: ${cleanText(item.manufacturer) || "Unknown"}`,
          `Model: ${cleanText(item.model) || "Unknown"}`,
          `Condition: ${cleanText(item.condition) || "Unknown"}`,
          `Status: ${cleanText(item.equipment_status) || "Unknown"}`,
        ].join("\n");
      })
      .join("\n\n---\n\n");

    const photoSummary = `Total attached media records: ${safeArray(photos).length}`;

    const systemPrompt = promptEngine.buildSystemPrompt(
      `
You are On Point Inspect's AI Report Review Brain.

You are reviewing a home inspection report before it is published.

Your job:
- Find missing information.
- Find inconsistent or unclear findings.
- Identify missing recommendations.
- Identify missing implications.
- Identify missing photos for safety/major concerns.
- Identify possible duplicate findings.
- Identify section or severity mismatches.
- Identify report completeness concerns.
- Keep recommendations practical for a home inspector.

Do NOT rewrite the full report.
Do NOT invent defects that are not documented.
Do NOT tell the inspector to inspect something unless it is a reasonable completeness check.
Do NOT claim code violations.
Do NOT be alarmist.

Return ONLY valid JSON.
      `,
      {
        propertyAddress:
          inspection.address ||
          inspection.property_address ||
          context.propertyAddress ||
          "",
        inspectionType:
          inspection.service_mode ||
          inspection.inspection_type ||
          context.inspectionType ||
          "",
        houseYear: inspection.year_built || context.yearBuilt || "",
        houseStyle: inspection.property_style || context.propertyStyle || "",
        previousFindings: context.previousFindings,
        equipmentFound: context.equipmentFound,
      }
    );

    const userPrompt = `
Review this inspection report.

Property:
${inspection.address || inspection.property_address || "Unknown"}

Base automated quality review:
${JSON.stringify(baseReview, null, 2)}

Equipment documented:
${equipmentSummary || "No equipment inventory records found."}

Photo/media summary:
${photoSummary}

Findings:
${findingsSummary || "No findings found."}

Return JSON in this exact structure:

{
  "score": 0,
  "passed": true,
  "summary": "",
  "criticalIssues": [],
  "warnings": [],
  "suggestions": [],
  "missingSystems": [],
  "duplicateConcerns": [],
  "sectionConcerns": [],
  "photoConcerns": [],
  "publishRecommendation": "Ready to publish | Review recommended | Do not publish yet"
}

Scoring guidance:
- 90-100: clean report, only minor suggestions.
- 75-89: usable report with some recommended review items.
- 60-74: report needs meaningful review before publishing.
- Below 60: report should not be published yet.

Keep items short and actionable.
    `;

    const brainResult = await inspectionBrain.run({
      task: "report_review",
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      responseFormat: "json_object",
    });

    let parsed: any = {};

    try {
      parsed = JSON.parse(brainResult.text || "{}");
    } catch {
      parsed = {};
    }

    const result = {
      score:
        Number.isFinite(Number(parsed.score))
          ? Math.max(0, Math.min(100, Math.round(Number(parsed.score))))
          : baseReview.score,
      passed:
        typeof parsed.passed === "boolean"
          ? parsed.passed
          : baseReview.passed,
      summary:
        cleanText(parsed.summary) ||
        "AI report review completed. Review the items below before publishing.",
      criticalIssues: safeArray(parsed.criticalIssues),
      warnings: safeArray(parsed.warnings),
      suggestions: safeArray(parsed.suggestions),
      missingSystems: safeArray(parsed.missingSystems),
      duplicateConcerns: safeArray(parsed.duplicateConcerns),
      sectionConcerns: safeArray(parsed.sectionConcerns),
      photoConcerns: safeArray(parsed.photoConcerns),
      publishRecommendation:
        cleanText(parsed.publishRecommendation) ||
        (baseReview.score >= 85 ? "Ready to publish" : "Review recommended"),
      baseIssues: baseReview.issues,
      aiModel: AI_MODEL,
      aiVersion: AI_VERSION,
      findingCount: safeArray(findings).length,
      equipmentCount: safeArray(equipment).length,
      photoCount: safeArray(photos).length,
    };

    await logAIEvent({
      userId: user.id,
      inspectionId,
      tool: "report_review",
      prompt: "AI Report Review",
      response: {
        score: result.score,
        passed: result.passed,
        publishRecommendation: result.publishRecommendation,
        warningCount: result.warnings.length,
        criticalIssueCount: result.criticalIssues.length,
        aiModel: AI_MODEL,
        aiVersion: AI_VERSION,
      },
      tokensUsed: brainResult.usage?.total_tokens ?? null,
      status: "success",
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI report review error:", error);

    await logAIEvent({
      inspectionId,
      tool: "report_review",
      status: "failed",
      response: {
        error: error?.message || "Failed to review report.",
      },
    });

    return NextResponse.json(
      { error: error?.message || "Failed to review report." },
      { status: 500 }
    );
  }
}

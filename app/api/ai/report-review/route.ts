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
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

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

// Return the saved review + checked-off items for this inspection so the panel
// can restore the list without a (slow, paid) re-run. Degrades to "nothing
// saved" if the persistence columns don't exist yet.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = normalizeInspectionId(
      url.searchParams.get("inspection_id") || url.searchParams.get("inspectionId"),
    );
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);
    const { data, error } = await supabase
      .from("inspections")
      .select("ai_review, ai_review_done, ai_review_at")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .maybeSingle();

    if (error) {
      // Columns likely not present yet (pre-migration) — behave as "nothing saved".
      return NextResponse.json({ review: null, done: [], reviewedAt: null });
    }

    return NextResponse.json({
      review: (data as any)?.ai_review ?? null,
      done: Array.isArray((data as any)?.ai_review_done) ? (data as any).ai_review_done : [],
      reviewedAt: (data as any)?.ai_review_at ?? null,
    });
  } catch {
    return NextResponse.json({ review: null, done: [], reviewedAt: null });
  }
}

// Save which review items the inspector has checked off, so the checklist state
// survives leaving the panel / app and syncs across devices.
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inspectionId = normalizeInspectionId(
      body.inspectionId || body.inspection_id || body.id,
    );
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const done = Array.isArray(body.done)
      ? body.done.map((v: any) => String(v)).slice(0, 1000)
      : [];

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);
    const { error } = await supabase
      .from("inspections")
      .update({ ai_review_done: done })
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value);

    // Best-effort: don't surface a hard error to the client if the column isn't
    // there yet — the local cache still holds the state.
    return NextResponse.json({ ok: !error });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to save." });
  }
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

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .maybeSingle();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const [
      { data: findings },
      { data: equipment },
      { data: photos },
      { data: referencePhotos },
    ] = await Promise.all([
        supabase
          .from("findings")
          .select(
            "id,title,section,severity,observation,implication,recommendation,image_url"
          )
          .eq("inspection_id", inspectionId)
          .order("created_at", { ascending: true }),
        supabase
          .from("equipment_inventory")
          .select(
            "id,equipment_type,manufacturer,model,serial,condition,equipment_status"
          )
          .eq("inspection_id", inspectionId),
        supabase
          .from("photos")
          .select("id,finding_id,public_url,file_path,media_type,is_video")
          .eq("inspection_id", inspectionId),
        supabase
          .from("section_reference_photos")
          .select("id")
          .eq("inspection_id", inspectionId),
      ]);

    // A finding can be documented with a VIDEO instead of a still photo. Videos
    // live in the photos table (media_type "video" / is_video). Build a per-
    // finding media map so we never nag "no main photo" when there's a video
    // (or any attached media) covering that defect.
    const findingMedia = new Map<string, { hasPhoto: boolean; hasVideo: boolean }>();
    for (const media of safeArray(photos)) {
      const fid =
        media?.finding_id !== undefined && media?.finding_id !== null
          ? String(media.finding_id)
          : "";
      if (!fid) continue;
      const isVideo =
        media?.is_video === true ||
        String(media?.media_type || "").toLowerCase().includes("video");
      const current = findingMedia.get(fid) || { hasPhoto: false, hasVideo: false };
      if (isVideo) current.hasVideo = true;
      else current.hasPhoto = true;
      findingMedia.set(fid, current);
    }
    const findingHasVisualMedia = (finding: any) => {
      if (cleanText(finding.image_url)) return true;
      const media = findingMedia.get(String(finding.id));
      return Boolean(media && (media.hasPhoto || media.hasVideo));
    };

    // Tell the base quality check about video/media so its "no main photo" rule
    // only fires when a finding has NO visual documentation at all.
    const findingsForReview = safeArray(findings).map((finding: any) => ({
      ...finding,
      hasVisualMedia: findingHasVisualMedia(finding),
    }));

    const baseReview = qualityControl.reviewReport({
      findings: findingsForReview,
      equipment: safeArray(equipment),
    });

    const context = await aiContext.load(inspectionId);

    const orderedFindings = safeArray(findings);
    const findingsSummary = orderedFindings
      .map((finding: any, index: number) => {
        const media = findingMedia.get(String(finding.id));
        const hasPic = Boolean(cleanText(finding.image_url) || media?.hasPhoto);
        const hasVid = Boolean(media?.hasVideo);
        const visual =
          hasPic && hasVid
            ? "Photo + video"
            : hasPic
              ? "Photo"
              : hasVid
                ? "Video"
                : "None";
        return [
          `Finding ${index + 1}`,
          `Section: ${cleanText(finding.section) || "Unknown"}`,
          `Severity: ${cleanText(finding.severity) || "Unknown"}`,
          `Title: ${cleanText(finding.title) || "Untitled"}`,
          `Observation: ${cleanText(finding.observation) || "Blank"}`,
          `Implication: ${cleanText(finding.implication) || "Blank"}`,
          `Recommendation: ${cleanText(finding.recommendation) || "Blank"}`,
          // A video counts as visual documentation — don't flag it as missing a photo.
          `Visual media: ${visual}`,
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
You are FLOW's AI Report Review Brain.

You are reviewing a home inspection report before it is published.

Your job:
- Find missing information.
- Find inconsistent or unclear findings.
- Identify missing recommendations.
- Identify missing implications.
- Identify missing photos for safety/major concerns ONLY when a finding's "Visual media" is "None". A finding with a Photo OR a Video is already visually documented — never tell the inspector to add a photo when a video is present.
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
  "criticalIssues": [ { "message": "", "findingNumber": 0, "section": "" } ],
  "warnings": [ { "message": "", "findingNumber": 0, "section": "" } ],
  "suggestions": [ { "message": "", "findingNumber": 0, "section": "" } ],
  "missingSystems": [],
  "duplicateConcerns": [ { "message": "", "findingNumber": 0, "section": "" } ],
  "sectionConcerns": [ { "message": "", "findingNumber": 0, "section": "" } ],
  "photoConcerns": [ { "message": "", "findingNumber": 0, "section": "" } ],
  "publishRecommendation": "Ready to publish | Review recommended | Do not publish yet"
}

For every issue that is about a specific finding, set "findingNumber" to that finding's number (1, 2, 3, ...) exactly as labeled "Finding N" in the Findings list above (and "section" to its section), so the inspector can jump straight to it. Use "findingNumber": 0 only for report-wide items that don't map to a single finding. Each item's "message" must be short and actionable.

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

    // Resolve which finding each review item is about, so the UI can jump to it.
    // We DON'T trust the model to echo an id or number reliably; instead we match
    // by content: the finding whose title words appear in the item's text. Falls
    // back to an explicit findingNumber the model may have provided.
    const normalize = (value: any) =>
      String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    const GENERIC_TITLES = new Set(["field finding", "inspection finding", "untitled", "finding"]);
    const findingWordSets = orderedFindings.map((finding: any) => {
      const title = normalize(finding.title);
      const words = GENERIC_TITLES.has(title)
        ? []
        : title.split(" ").filter((w) => w.length > 3);
      return { finding, words };
    });

    const matchFindingIdByText = (text: string) => {
      const msg = normalize(text);
      if (!msg) return undefined;
      let best: any = null;
      let bestScore = 0;
      for (const { finding, words } of findingWordSets) {
        if (words.length === 0) continue;
        const hits = words.filter((w) => msg.includes(w)).length;
        const score = hits / words.length;
        if (score > bestScore) {
          bestScore = score;
          best = finding;
        }
      }
      // Require a solid majority of the title's words to appear, so we don't
      // link an item to an unrelated finding.
      return bestScore >= 0.6 ? best?.id : undefined;
    };

    const attachFindingIds = (items: any) =>
      safeArray(items).map((item: any) => {
        const isObj = item && typeof item === "object";
        const message = isObj
          ? cleanText(
              item.message ||
                item.title ||
                item.issue ||
                item.concern ||
                item.description ||
                item.text ||
                "",
            )
          : String(item || "");

        let findingId: any;

        // 1. Explicit findingNumber if the model provided a valid one.
        if (isObj) {
          const num = Number(item.findingNumber);
          if (Number.isInteger(num) && num >= 1 && num <= orderedFindings.length) {
            findingId = orderedFindings[num - 1]?.id;
          }
        }

        // 2. Content match on the item's text.
        if (findingId === undefined || findingId === null) {
          findingId = matchFindingIdByText(message);
        }

        if (findingId === undefined || findingId === null) return item;
        return { ...(isObj ? item : {}), message, findingId };
      });

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
      criticalIssues: attachFindingIds(parsed.criticalIssues),
      warnings: attachFindingIds(parsed.warnings),
      suggestions: attachFindingIds(parsed.suggestions),
      missingSystems: safeArray(parsed.missingSystems),
      duplicateConcerns: attachFindingIds(parsed.duplicateConcerns),
      sectionConcerns: attachFindingIds(parsed.sectionConcerns),
      photoConcerns: attachFindingIds(parsed.photoConcerns),
      publishRecommendation:
        cleanText(parsed.publishRecommendation) ||
        (baseReview.score >= 85 ? "Ready to publish" : "Review recommended"),
      baseIssues: baseReview.issues,
      aiModel: AI_MODEL,
      aiVersion: AI_VERSION,
      findingCount: safeArray(findings).length,
      equipmentCount: safeArray(equipment).length,
      // Total report media = finding/inspection photos & videos + section
      // reference-gallery photos (separate table).
      photoCount: safeArray(photos).length + safeArray(referencePhotos).length,
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

    // Persist the review on the inspection so the inspector can reopen the panel
    // later — even after an app restart or on another device — and keep working
    // the list WITHOUT paying to re-run. Best-effort: if the columns aren't
    // present yet (pre-migration), ignore and rely on the client's local cache.
    // Note: we intentionally do NOT reset ai_review_done here, so items the
    // inspector already checked off stay checked across a re-run.
    try {
      await supabase
        .from("inspections")
        .update({ ai_review: result, ai_review_at: new Date().toISOString() })
        .eq("id", inspectionId)
        .eq(accessFilter.column, accessFilter.value);
    } catch {
      /* column may not exist yet */
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI report review error:", error);
    const serviceError = classifyAIServiceError(error);

    await logAIEvent({
      inspectionId,
      tool: "report_review",
      status: "failed",
      response: {
        code: serviceError.code,
        error: serviceError.technicalMessage || serviceError.message,
        retryable: serviceError.retryable,
      },
    });

    return NextResponse.json(
      {
        error: serviceError.message,
        title: serviceError.title,
        code: serviceError.code,
        retryable: serviceError.retryable,
        retryAfterSeconds: serviceError.retryAfterSeconds,
      },
      { status: serviceError.status }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logAIEvent } from "../../../lib/logging";
import { inspectionBrain } from "../../../lib/ai";
import { getAIModel, getAIVersion } from "../../../lib/openai";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "inspection-photos";

const AI_OFFLINE_MODEL = getAIModel();
const AI_OFFLINE_VERSION = getAIVersion("offline-field-ai-after-sync");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

async function getSyncReceipt(queueItemId: string) {
  if (!queueItemId) return null;

  const { data, error } = await supabase
    .from("offline_sync_receipts")
    .select("result")
    .eq("queue_item_id", queueItemId)
    .maybeSingle();

  if (error) return null;
  return data?.result || null;
}

async function saveSyncReceipt({
  queueItemId,
  inspectionId,
  itemType,
  result,
}: {
  queueItemId: string;
  inspectionId: string;
  itemType: string;
  result: Record<string, any>;
}) {
  if (!queueItemId) return;

  try {
    await supabase
      .from("offline_sync_receipts")
      .upsert(
        {
          queue_item_id: queueItemId,
          inspection_id: inspectionId,
          item_type: itemType,
          result,
        },
        { onConflict: "queue_item_id" },
      );
  } catch {
    // The optional idempotency table may not exist until the v2 migration is run.
  }
}

const VALID_SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const VALID_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

function cleanText(value: any) {
  return String(value || "").trim();
}

function safeSectionValue(value: any, fallback = "Exterior") {
  const clean = cleanText(value);
  return VALID_SECTIONS.includes(clean) ? clean : fallback;
}

function safeSeverityValue(value: any, fallback = "Recommended Repair") {
  const clean = cleanText(value);
  return VALID_SEVERITIES.includes(clean) ? clean : fallback;
}

function base64ToBuffer(base64: string) {
  const cleanBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
  return Buffer.from(cleanBase64, "base64");
}

function sanitizeFileName(name: string) {
  return String(name || "offline-photo.jpg")
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

function safeSection(section: string) {
  return String(section || "Exterior")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function fallbackTitle(payload: any) {
  return (
    cleanText(payload?.title) ||
    cleanText(payload?.inspector_note || payload?.note).slice(0, 80) ||
    cleanText(payload?.observation).slice(0, 80) ||
    "Offline Field Note"
  );
}

function shouldRunAiAfterSync(payload: any) {
  if (payload?.run_ai_after_sync === false) return false;
  if (payload?.ai_after_sync === false) return false;

  const hasUsefulText = Boolean(
    cleanText(payload?.inspector_note || payload?.note) ||
      cleanText(payload?.title) ||
      cleanText(payload?.observation),
  );

  return hasUsefulText && Boolean(process.env.OPENAI_API_KEY);
}

function getOfflineCreatedAt(payload: any, itemCreatedAt?: string) {
  return cleanText(payload?.offline_created_at || payload?.created_at || itemCreatedAt);
}

function wasEditedAfterOfflineCapture(row: any, offlineCreatedAt: string) {
  if (!offlineCreatedAt || !row?.updated_at) return false;

  const updatedAt = new Date(row.updated_at).getTime();
  const capturedAt = new Date(offlineCreatedAt).getTime();

  if (!Number.isFinite(updatedAt) || !Number.isFinite(capturedAt)) return false;

  // Give the database a short grace window for insert/update timestamps.
  return updatedAt > capturedAt + 3000;
}

async function uploadOfflinePhoto({
  inspectionId,
  photo,
  folder = "offline",
}: {
  inspectionId: string;
  photo: any;
  folder?: string;
}) {
  if (!photo?.base64) return null;

  const fileName = sanitizeFileName(photo.name || "offline-photo.jpg");
  const filePath = `${inspectionId}/${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${fileName}`;

  const buffer = base64ToBuffer(photo.base64);

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, buffer, {
      contentType: photo.type || "image/jpeg",
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(filePath);

  return {
    filePath,
    publicUrl: publicData.publicUrl || null,
    mimeType: photo.type || "image/jpeg",
  };
}

async function generateAiFindingAfterSync({
  payload,
  inspectionId,
  findingId,
  photoInputs,
  offlineCreatedAt,
}: {
  payload: any;
  inspectionId: string;
  findingId: string | number;
  photoInputs: any[];
  offlineCreatedAt?: string;
}) {
  const inspectorNote = cleanText(payload?.inspector_note || payload?.note);
  const existingTitle = cleanText(payload?.title);
  const existingObservation = cleanText(payload?.observation);
  const existingImplication = cleanText(payload?.implication);
  const existingRecommendation = cleanText(payload?.recommendation);

  if (!shouldRunAiAfterSync(payload)) {
    return {
      ran: false,
      reason: "AI after sync disabled or no useful text.",
    };
  }

  const systemPrompt = `
You are the FLOW field intelligence engine.

You are a senior certified home inspector writing professional inspection report findings from offline field notes.

The inspector's note and manually entered text are the PRIMARY SOURCE OF TRUTH.
Use the uploaded photos only as supporting context. Do not invent defects that are not supported by the inspector's note or visible image evidence.

Return ONLY valid JSON in this exact structure:

{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "reviewRequired": true,
  "aiReasoning": ""
}

Rules:
- Write clear, professional, client-friendly home inspection report language.
- Keep the wording accurate and not alarmist.
- If the inspector used cautious wording such as possible, appears, suspected, or may, preserve that caution.
- Do not cite code unless the note clearly supports a safety concern.
- Do not diagnose concealed conditions as fact.
- If the existing title/observation/recommendation are already good, polish them instead of replacing them.
- Use complete sentences.
- No markdown.
- No bullet points.
- Always set reviewRequired to true because this was generated after offline sync and must be reviewed by the inspector.

Allowed sections:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.

Allowed severities:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.
`;

  const userPrompt = `
Create a polished inspection finding from this offline field item.

Inspection ID: ${inspectionId}
Finding ID: ${findingId}

Selected section:
${cleanText(payload?.section) || "Exterior"}

Selected severity:
${cleanText(payload?.severity) || "Recommended Repair"}

Inspector quick note:
${inspectorNote || "None"}

Existing title:
${existingTitle || "None"}

Existing observation:
${existingObservation || "None"}

Existing implication:
${existingImplication || "None"}

Existing recommendation:
${existingRecommendation || "None"}

Important:
Preserve the inspector's intent. Improve the report language, but do not drift away from what was actually documented.
`;

  const imageInputs = photoInputs
    .filter((photo) => String(photo?.mimeType || "").startsWith("image/") && photo?.base64)
    .slice(0, 4)
    .map((photo) => ({
      mimeType: photo.mimeType || "image/jpeg",
      base64: String(photo.base64).includes(",")
        ? String(photo.base64).split(",")[1]
        : String(photo.base64),
    }));

  const brainResult = await inspectionBrain.run({
    task: "finding",
    systemPrompt,
    userPrompt,
    images: imageInputs,
    temperature: 0.15,
    responseFormat: "json_object",
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(brainResult.text || "{}");
  } catch {
    parsed = {};
  }

  const nextTitle = cleanText(parsed.title) || existingTitle || fallbackTitle(payload);
  const nextSection = safeSectionValue(parsed.section, safeSectionValue(payload.section));
  const nextSeverity = safeSeverityValue(parsed.severity, safeSeverityValue(payload.severity));
  const nextObservation =
    cleanText(parsed.observation) ||
    existingObservation ||
    (inspectorNote ? `Inspector field note: ${inspectorNote}` : "");
  const nextImplication = cleanText(parsed.implication) || existingImplication;
  const nextRecommendation = cleanText(parsed.recommendation) || existingRecommendation;
  const aiReasoning = cleanText(parsed.aiReasoning);

  const updatePayload: Record<string, any> = {
    title: nextTitle,
    section: nextSection,
    severity: nextSeverity,
    observation: nextObservation,
    implication: nextImplication,
    recommendation: nextRecommendation,
  };

  if (offlineCreatedAt) {
    const { data: latestFinding } = await supabase
      .from("findings")
      .select("id, updated_at")
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (wasEditedAfterOfflineCapture(latestFinding, offlineCreatedAt)) {
      await logAIEvent({
        inspectionId,
        tool: "offline_field_ai_after_sync",
        prompt: userPrompt,
        response: {
          findingId,
          skipped: true,
          reason: "Finding was edited after offline capture. AI update skipped to avoid overwriting newer inspector changes.",
        },
        status: "success",
      });

      return {
        ran: false,
        skipped: true,
        reason:
          "Finding was edited after offline capture. AI update skipped to avoid overwriting newer inspector changes.",
      };
    }
  }

  // These columns may not exist in every older database. Try them, then fall back safely.
  const enhancedPayload = {
    ...updatePayload,
    ai_review_required: true,
    ai_generated: true,
    ai_source: "offline_field_ai_after_sync",
    ai_model: AI_OFFLINE_MODEL,
    ai_version: AI_OFFLINE_VERSION,
    ai_reasoning: aiReasoning || null,
  };

  const { error: enhancedError } = await supabase
    .from("findings")
    .update(enhancedPayload)
    .eq("id", findingId)
    .eq("inspection_id", inspectionId);

  if (enhancedError) {
    const { error: fallbackError } = await supabase
      .from("findings")
      .update(updatePayload)
      .eq("id", findingId)
      .eq("inspection_id", inspectionId);

    if (fallbackError) throw fallbackError;
  }

  await logAIEvent({
    inspectionId,
    tool: "offline_field_ai_after_sync",
    prompt: userPrompt,
    response: {
      findingId,
      title: nextTitle,
      section: nextSection,
      severity: nextSeverity,
      reviewRequired: true,
      aiModel: AI_OFFLINE_MODEL,
      aiVersion: AI_OFFLINE_VERSION,
      enhancedColumnsSaved: !enhancedError,
    },
    tokensUsed: brainResult.usage?.total_tokens ?? null,
    status: "success",
  });

  return {
    ran: true,
    title: nextTitle,
    section: nextSection,
    severity: nextSeverity,
    reviewRequired: true,
  };
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const item = await req.json().catch(() => ({}));

    if (!item?.type) {
      return NextResponse.json(
        { error: "Missing offline queue item type." },
        { status: 400 },
      );
    }

    const payload = item.payload || {};
    const offlineCreatedAt = getOfflineCreatedAt(payload, item.createdAt);
    const inspectionId = String(payload.inspection_id || "").trim();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection_id." }, { status: 400 });
    }

    // Ownership gate: the caller may only sync into an inspection they own (or
    // one on their team, for company owners). Without this, any signed-in user
    // could write findings/photos into another company's inspection by id.
    const authorized = await authorizeInspection(supabase, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const queueItemId = cleanText(item.id);
    const existingReceipt = await getSyncReceipt(queueItemId);

    if (existingReceipt) {
      return NextResponse.json({
        ...existingReceipt,
        duplicatePrevented: true,
      });
    }

    // The IndexedDB offline queue stores media as raw Blobs (no cap, videos
    // included) and only converts to base64 at send time, so accept every photo
    // and video the queued item carries instead of truncating to a fixed count.
    const offlinePhotos = Array.isArray(payload.photos) ? payload.photos : [];

    if (item.type === "reference_photo") {
      if (offlinePhotos.length === 0) {
        return NextResponse.json(
          { error: "Reference photo sync requires at least one photo." },
          { status: 400 },
        );
      }

      let saved = 0;
      const section = payload.section || "Exterior";
      const caption =
        cleanText(payload.caption || payload.inspector_note || payload.note || payload.title) ||
        null;

      for (const photo of offlinePhotos) {
        const upload = await uploadOfflinePhoto({
          inspectionId,
          photo,
          folder: `reference-photos/${safeSection(section)}`,
        });

        if (!upload) continue;

        const { error } = await supabase.from("section_reference_photos").insert({
          inspection_id: inspectionId,
          section,
          caption,
          file_path: upload.filePath,
          public_url: upload.publicUrl,
        });

        if (error) throw error;
        saved += 1;
      }

      const result = {
        ok: true,
        synced: true,
        type: "reference_photo",
        photo_count: saved,
      };

      await saveSyncReceipt({
        queueItemId,
        inspectionId,
        itemType: "reference_photo",
        result,
      });

      return NextResponse.json(result);
    }

    if (item.type === "finding") {
      const title = fallbackTitle(payload);
      const inspectorNote = cleanText(payload.inspector_note || payload.note);
      const observation =
        cleanText(payload.observation) ||
        (inspectorNote ? `Inspector field note: ${inspectorNote}` : "");

      const { data: finding, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title,
          section: safeSectionValue(payload.section),
          severity: safeSeverityValue(payload.severity),
          observation,
          implication: cleanText(payload.implication),
          recommendation: cleanText(payload.recommendation),
          image_url: null,
        })
        .select()
        .single();

      if (error) throw error;

      let firstImageUrl: string | null = null;
      let photoCount = 0;
      const uploadedPhotoInputs: any[] = [];

      for (const photo of offlinePhotos) {
        const upload = await uploadOfflinePhoto({
          inspectionId,
          photo,
          folder: "offline-findings",
        });

        if (!upload) continue;

        if (!firstImageUrl && String(upload.mimeType || "").startsWith("image/")) {
          firstImageUrl = upload.publicUrl;
        }

        const isVideo = String(upload.mimeType || "").startsWith("video/");

        const { error: photoError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          finding_id: finding.id,
          public_url: upload.publicUrl,
          file_path: upload.filePath,
          is_video: isVideo,
          mime_type: upload.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
          thumbnail_url: null,
          thumbnail_path: null,
        });

        if (photoError) throw photoError;

        uploadedPhotoInputs.push({
          ...upload,
          base64: photo.base64,
        });

        photoCount += 1;
      }

      if (firstImageUrl) {
        await supabase
          .from("findings")
          .update({ image_url: firstImageUrl })
          .eq("id", finding.id)
          .eq("inspection_id", inspectionId);
      }

      let aiAfterSync: any = {
        ran: false,
        reason: "Not requested or unavailable.",
      };

      try {
        aiAfterSync = await generateAiFindingAfterSync({
          payload,
          inspectionId,
          findingId: finding.id,
          photoInputs: uploadedPhotoInputs,
          offlineCreatedAt,
        });
      } catch (aiError: any) {
        console.error("Offline AI after sync failed:", aiError);

        await logAIEvent({
          inspectionId,
          tool: "offline_field_ai_after_sync",
          prompt: cleanText(payload?.note || payload?.inspector_note),
          response: {
            findingId: finding.id,
            error: aiError?.message || "Offline AI after sync failed.",
          },
          status: "failed",
        });

        // Do not fail the sync if AI cleanup fails. The raw finding is already safely saved.
        aiAfterSync = {
          ran: false,
          error: aiError?.message || "AI cleanup failed after sync.",
        };
      }

      const result = {
        ok: true,
        synced: true,
        type: "finding",
        finding_id: finding.id,
        photo_count: photoCount,
        ai_after_sync: aiAfterSync,
      };

      await saveSyncReceipt({
        queueItemId,
        inspectionId,
        itemType: "finding",
        result,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: `Unsupported offline item type: ${item.type}` },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Offline sync error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to sync offline item." },
      { status: 500 },
    );
  }
}

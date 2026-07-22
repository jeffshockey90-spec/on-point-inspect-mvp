import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inspectionBrain } from "../../../../lib/ai";
import { learningEngine } from "../../../../lib/ai/LearningEngine";
import {
  routeFindingSection,
  normalizeSeverity,
} from "../../../../lib/routeFindingSection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}


function cleanText(value: any) {
  return String(value || "").trim();
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {}

  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return valid JSON.");
  return JSON.parse(match[0]);
}

function normalizeConfidence(value: any, fallback = 0.72) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number > 1) return Math.max(0, Math.min(1, number / 100));
  return Math.max(0, Math.min(1, number));
}

function cleanSection(value: any, fallback = "Exterior") {
  const clean = cleanText(value);
  const routed = routeFindingSection({
    section: clean,
    title: "",
    observation: "",
    implication: "",
    recommendation: "",
  });

  if (VALID_SECTIONS.includes(routed)) return routed;
  return VALID_SECTIONS.includes(clean) ? clean : fallback;
}

function cleanSeverity(value: any, fallback = "Recommended Repair") {
  const normalized = normalizeSeverity(cleanText(value));
  return VALID_SEVERITIES.includes(normalized) ? normalized : fallback;
}

function cleanRegion(value: any, fallbackLabel = "") {
  if (!value) return null;

  let raw: any = value;

  if (Array.isArray(value) && value.length >= 4) {
    raw = { x: value[0], y: value[1], width: value[2], height: value[3] };
  }

  if (typeof raw !== "object") return null;

  let x = Number(raw.x ?? raw.left ?? raw.x1 ?? raw.minX);
  let y = Number(raw.y ?? raw.top ?? raw.y1 ?? raw.minY);
  let width = Number(raw.width ?? raw.w);
  let height = Number(raw.height ?? raw.h);

  const x2 = Number(raw.x2 ?? raw.right ?? raw.maxX);
  const y2 = Number(raw.y2 ?? raw.bottom ?? raw.maxY);

  if (!Number.isFinite(width) && Number.isFinite(x2) && Number.isFinite(x)) {
    width = x2 - x;
  }
  if (!Number.isFinite(height) && Number.isFinite(y2) && Number.isFinite(y)) {
    height = y2 - y;
  }

  if (![x, y, width, height].every(Number.isFinite)) return null;

  // Accept either normalized 0–1 coordinates or percentages 0–100.
  const largest = Math.max(Math.abs(x), Math.abs(y), Math.abs(width), Math.abs(height));
  if (largest > 1.5) {
    x /= 100;
    y /= 100;
    width /= 100;
    height /= 100;
  }

  const clamp = (number: number) => Math.max(0, Math.min(1, number));
  const region = {
    x: clamp(x),
    y: clamp(y),
    width: clamp(width),
    height: clamp(height),
    label: cleanText(raw.label || raw.name || fallbackLabel),
    approximate: false,
  };

  if (region.width < 0.02 || region.height < 0.02) return null;
  if (region.x + region.width > 1) region.width = Math.max(0.02, 1 - region.x);
  if (region.y + region.height > 1) region.height = Math.max(0.02, 1 - region.y);

  return region;
}

async function loadRecentInspectionMemory(inspectionId: string, section: string) {
  if (!inspectionId) return "No prior AI memory was available for this inspection.";

  const supabase = createAdminClient();
  if (!supabase) return "No prior AI memory was available for this inspection.";

  let query = supabase
    .from("inspection_ai_memory_events")
    .select("event_type,status,title,detail,confidence,section,created_at")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (section) query = query.eq("section", section);

  const { data, error } = await query;
  if (error || !data?.length) {
    return "No prior AI memory was available for this inspection.";
  }

  return data
    .slice(0, 12)
    .map((event: any) => {
      const title = cleanText(event.title) || cleanText(event.event_type) || "Inspection event";
      const detail = cleanText(event.detail);
      const status = cleanText(event.status) || "active";
      return `- ${title} [${status}]${detail ? `: ${detail}` : ""}`;
    })
    .join("\n");
}

function cleanSuggestion(value: any, index: number) {
  const title = cleanText(value?.title) || `AI Suggestion ${index + 1}`;
  const observation =
    cleanText(value?.observation) ||
    cleanText(value?.summary) ||
    "A visible condition may require inspector review.";

  const implication =
    cleanText(value?.implication) ||
    "The significance of this condition should be verified by the inspector.";

  const recommendation =
    cleanText(value?.recommendation) ||
    "Inspector should verify the condition and document as needed.";

  const section = cleanSection(value?.section);
  const severity = cleanSeverity(value?.severity);

  return {
    id:
      cleanText(value?.id) ||
      `${section}-${severity}-${title}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    title,
    section,
    severity,
    observation,
    implication,
    recommendation,
    confidence: normalizeConfidence(value?.confidence),
    evidence: Array.isArray(value?.evidence)
      ? value.evidence.map(cleanText).filter(Boolean).slice(0, 5)
      : [],
    suggestionType: cleanText(value?.suggestionType || value?.type) || "defect",
    region:
      cleanRegion(
        value?.region || value?.boundingBox || value?.box || value?.bbox,
        title,
      ) || {
        x: 0.12,
        y: 0.12,
        width: 0.76,
        height: 0.58,
        label: title,
        approximate: true,
      },
  };
}

function cleanReminder(value: any, index: number) {
  return {
    id: cleanText(value?.id) || `reminder-${index + 1}`,
    title: cleanText(value?.title) || "Verify before leaving this area",
    detail: cleanText(value?.detail || value?.description),
    priority: cleanText(value?.priority) || "medium",
    action: cleanText(value?.action) || "check",
    confidence: normalizeConfidence(value?.confidence, 0.7),
  };
}

function cleanLimitation(value: any, index: number, fallbackSection: string) {
  const section = cleanSection(value?.section, fallbackSection);
  const title = cleanText(value?.title) || "Inspection Limitation";

  return {
    id:
      cleanText(value?.id) ||
      `limitation-${section}-${index + 1}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    title,
    section,
    limitation:
      cleanText(value?.limitation || value?.observation || value?.description) ||
      "Visibility or access appeared limited in this area.",
    reason:
      cleanText(value?.reason || value?.cause) ||
      "The limitation should be verified by the inspector.",
    recommendation:
      cleanText(value?.recommendation) ||
      "Document the limitation and inspect further if access becomes available.",
    confidence: normalizeConfidence(value?.confidence, 0.72),
    region:
      cleanRegion(
        value?.region || value?.boundingBox || value?.box || value?.bbox,
        title,
      ) || null,
  };
}

function imageDataUrlParts(imageDataUrl: string) {
  const [header, base64] = String(imageDataUrl || "").split(",");
  const mimeMatch = header.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";

  if (!base64) {
    throw new Error("Invalid image data.");
  }

  return {
    mimeType,
    base64,
  };
}

function filterForLiveWatch(items: any[]) {
  return items.filter((item) => {
    const confidence = normalizeConfidence(item?.confidence, 0);
    const severity = cleanText(item?.severity).toLowerCase();
    const type = cleanText(item?.suggestionType || item?.type).toLowerCase();
    const title = cleanText(item?.title).toLowerCase();
    const observation = cleanText(item?.observation || item?.summary).toLowerCase();
    const combined = `${title} ${observation}`;

    const importantBySeverity =
      severity.includes("safety") ||
      severity.includes("major") ||
      severity.includes("recommended repair");

    const importantByType =
      type.includes("safety") || type.includes("defect") || type.includes("documentation");

    const meaningfulTerms = [
      "double tap",
      "double tapped",
      "overheating",
      "scorch",
      "burn",
      "corrosion",
      "active leak",
      "leak",
      "missing",
      "damaged",
      "loose",
      "open ground",
      "reverse polarity",
      "gfcI",
      "gfci",
      "afci",
      "crack",
      "structural",
      "safety",
      "unsafe",
      "defect",
      "repair",
      "data plate",
      "label",
    ];

    const looksMeaningful = meaningfulTerms.some((term) =>
      combined.includes(term.toLowerCase()),
    );

    return confidence >= 0.78 || importantBySeverity || importantByType || looksMeaningful;
  });
}


function sectionFallbackReminders(section: string, isLiveWatch: boolean) {
  const clean = cleanSection(section, section);
  const common = [
    {
      id: `photo-${clean}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: `${clean} overview photo documented`,
      detail: "Capture an overview or representative photo before leaving this section if one has not already been saved.",
      priority: isLiveWatch ? "medium" : "high",
      action: "photo",
      confidence: isLiveWatch ? 0.72 : 0.86,
    },
  ];

  const bySection: Record<string, any[]> = {
    Electrical: [
      {
        id: "electrical-panel-label-photo",
        title: "Panel label and breaker area documented",
        detail: "Before leaving the panel, confirm the label, breaker layout, dead front condition, clearances, and any visible overheating/corrosion concerns were documented.",
        priority: "high",
        action: "photo",
        confidence: 0.9,
      },
      {
        id: "electrical-gfci-afci-check",
        title: "GFCI / AFCI and accessible receptacles considered",
        detail: "Confirm wet-area protection, representative receptacles, smoke/CO notes, and any limitation if access/testing was restricted.",
        priority: "medium",
        action: "check",
        confidence: 0.82,
      },
    ],
    Plumbing: [
      {
        id: "plumbing-water-heater-tpr",
        title: "Water heater and TPR discharge checked",
        detail: "Verify water heater condition, visible data plate, TPR valve/discharge, leaks, corrosion, venting where applicable, and expansion tank where present.",
        priority: "high",
        action: "check",
        confidence: 0.88,
      },
    ],
    Heating: [
      {
        id: "heating-data-plate-filter-venting",
        title: "Heating data plate, filter, and venting documented",
        detail: "Capture data plate when visible and verify operation/limitation, filter condition, venting/flue where applicable, and service concerns.",
        priority: "high",
        action: "scan_data_plate",
        confidence: 0.88,
      },
    ],
    Cooling: [
      {
        id: "cooling-data-plate-temperature-limitation",
        title: "Cooling data plate and operating limitation checked",
        detail: "Capture condenser/air handler data plate when visible and document if outdoor temperature or conditions limited operation.",
        priority: "high",
        action: "scan_data_plate",
        confidence: 0.86,
      },
    ],
    Roof: [
      {
        id: "roof-access-flashing-penetrations",
        title: "Roof access, flashing, and penetrations documented",
        detail: "Confirm roof access method, covering condition, penetrations, flashing, drainage, and any limitation if not walked or not fully visible.",
        priority: "high",
        action: "photo",
        confidence: 0.86,
      },
    ],
    Garage: [
      {
        id: "garage-door-safety-fire-separation",
        title: "Garage door safety and fire separation checked",
        detail: "Confirm photo eyes/auto-reverse where applicable, spring/cable condition, opener operation, and visible fire separation concerns.",
        priority: "high",
        action: "check",
        confidence: 0.86,
      },
    ],
    "Attic, Insulation & Ventilation": [
      {
        id: "attic-access-insulation-ventilation",
        title: "Attic access, insulation, ventilation, and sheathing reviewed",
        detail: "Confirm attic access/limitation, insulation type/depth, ventilation, roof sheathing, staining, and bath fan routing were documented.",
        priority: "high",
        action: "photo",
        confidence: 0.86,
      },
    ],
  };

  const sectionItems = bySection[clean] || [];
  return [...sectionItems, ...common].slice(0, isLiveWatch ? 1 : 3).map((item, index) => cleanReminder(item, index));
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const imageDataUrl = cleanText(body.imageDataUrl);
    const inspectionId = cleanText(body.inspectionId || body.inspection_id);
    const currentSection = cleanText(body.currentSection) || "Exterior";
    const currentSeverity = cleanText(body.currentSeverity) || "Recommended Repair";
    const mode = cleanText(body.mode) || "manual";
    const isLiveWatch = mode === "live_watch";
    const recentMemory = await loadRecentInspectionMemory(inspectionId, currentSection);
    const inspectorLearningPatterns = await learningEngine.getPatterns(180);
    const inspectorLearningMemory = learningEngine.formatPatternsForPrompt(
      inspectorLearningPatterns,
    );

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Missing imageDataUrl." },
        { status: 400 },
      );
    }

    const image = imageDataUrlParts(imageDataUrl);

    const systemPrompt = `
You are FLOW AI Second Inspector, a senior home inspection assistant watching a live inspection camera frame.

You are suggestions-only. Never say a defect is saved. Never imply the inspector must write something up.
The inspector must approve every finding before anything is saved.

Analyze the frame for:
1. The current area/system.
2. Multiple visible possible defects or reportable conditions in the same area.
3. Inspection limitations such as personal belongings, stored items, blocked access, inaccessible areas, snow/debris coverage, locked rooms, low clearance, unsafe access, utilities off, or components not fully visible.
4. Inspection reminders before walking away, including missing required photos, representative overview photos, safety checks, operation/limitation checks, and data plate/documentation prompts.
5. Equipment/data-plate scan prompts when equipment is visible.

Return ONLY valid JSON in this exact structure:

{
  "area": "",
  "system": "",
  "confidence": 0.0,
  "summary": "",
  "suggestions": [
    {
      "id": "",
      "title": "",
      "section": "",
      "severity": "",
      "observation": "",
      "implication": "",
      "recommendation": "",
      "confidence": 0.0,
      "evidence": [],
      "suggestionType": "defect | safety | maintenance | documentation",
      "region": {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0,
        "label": ""
      }
    }
  ],
  "reminders": [
    {
      "id": "",
      "title": "",
      "detail": "",
      "priority": "low | medium | high",
      "action": "check | document | photo | scan_data_plate",
      "confidence": 0.0,
      "region": {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0,
        "label": ""
      }
    }
  ],
  "limitations": [
    {
      "id": "",
      "title": "",
      "section": "",
      "limitation": "",
      "reason": "",
      "recommendation": "",
      "confidence": 0.0
    }
  ],
  "dataPlatePrompt": {
    "needed": false,
    "reason": "",
    "equipmentType": ""
  }
}

Rules:
- Return multiple suggestions when multiple visible concerns are present.
- Do not limit output to one defect.
- For every visible suggestion and every visible limitation, you MUST include a region using normalized x, y, width, and height values from 0 to 1.
- The coordinates refer to the full supplied image: x/y are the top-left corner and width/height define the box.
- Tightly frame the exact visible evidence. Do not omit the region for a visible condition.
- If exact localization is genuinely impossible, provide your best broad approximate region rather than null.
- It is okay to return zero suggestions if nothing reportable is visible.
- Keep suggestions conservative and based on visible evidence.
- Use cautious wording such as "appeared", "was observed", "may", and "recommend verification".
- Do not claim code violations.
- Do not diagnose concealed conditions.
- Do not identify mold/asbestos as fact from a photo.
- If access or visibility is limited by personal belongings, stored items, coverings, obstructions, unsafe access, weather, snow, locked areas, low clearance, or utilities off, return a limitation.
- Limitation wording should explain what was limited, why it was limited, and recommend further evaluation only when appropriate.
- Do not overstate limitations. If the limitation is only possible, say "appeared" or "may have limited visibility."
- If water heater, HVAC, electrical panel, appliance, or similar equipment is visible, include a data plate scan reminder unless the data plate is clearly already captured.
- Reminders should include items the inspector should verify before leaving the area.
- Use reminder action "photo" when the inspector should capture a photo before leaving.
- Use reminder action "check" when no photo is required but the item should be verified.
- Use reminder action "scan_data_plate" when a visible equipment label/data plate should be captured.
- Do not include markdown.
- Do not include any text outside JSON.

Live-watch behavior:
- If mode is "live_watch", only interrupt the inspector for meaningful visible issues.
- In live_watch mode, prefer zero suggestions over weak or cosmetic suggestions.
- In live_watch mode, do not return generic normal observations.
- In live_watch mode, focus on safety concerns, major concerns, recommended repairs, missing documentation, blocked/limited inspection areas, or data plate reminders.
- In live_watch mode, avoid cosmetic comments unless the visible condition is clearly reportable.

Allowed sections:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Fireplace, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage.

Allowed severities:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.
`;

    const userPrompt = `
Current selected section: ${currentSection}
Current selected severity: ${currentSeverity}
Mode: ${mode}

Recent inspection memory for this section:
${recentMemory}

Inspector-specific learning memory from prior edits and decisions:
${inspectorLearningMemory}

Learning rules:
- Match the inspector's demonstrated wording, recommendation style, severity choices, and section routing when supported by the visible evidence.
- Use ignored suggestions to reduce repetitive low-value interruptions.
- Never suppress a clear safety concern merely because a similar suggestion was previously ignored.
- Inspector edits and decisions are preferences, not permission to invent or overlook evidence.

Analyze this live inspection camera frame based on what is actually visible. The selected section is context only and must not prevent you from identifying a visible concern from another section.
Use prior memory to avoid repeating items the inspector already confirmed, while still resurfacing a concern if the current frame provides stronger or materially different evidence.

Return multiple findings if multiple concerns are visible.
Also return "before you walk away" reminders and data plate scanning prompts where appropriate.

If mode is "live_watch":
- Only interrupt the inspector for meaningful, visible issues.
- Do not return minor cosmetic comments unless they are clearly reportable.
- Prefer zero suggestions over weak suggestions.
- Focus on safety concerns, major concerns, missing documentation, visible defects, limitations, or data plate reminders.
`;

    const brainResult = await inspectionBrain.run({
      task: "defect",
      systemPrompt,
      userPrompt,
      images: [image],
      temperature: isLiveWatch ? 0.05 : 0.1,
      responseFormat: "json_object",
    });

    const parsed = safeJsonParse(brainResult.text || "{}");

    const rawSuggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.slice(0, 6)
      : [];

    const suggestions = rawSuggestions
      .slice(0, 6)
      .map(cleanSuggestion);

    let reminders = Array.isArray(parsed?.reminders)
      ? parsed.reminders
          .slice(0, 8)
          .filter((item: any) => {
            if (!isLiveWatch) return true;
            const priority = cleanText(item?.priority).toLowerCase();
            const action = cleanText(item?.action).toLowerCase();
            const confidence = normalizeConfidence(item?.confidence, 0);
            return priority === "high" || action === "scan_data_plate" || confidence >= 0.8;
          })
          .map(cleanReminder)
      : [];

    if (reminders.length === 0 && !isLiveWatch) {
      reminders = sectionFallbackReminders(currentSection, isLiveWatch);
    }

    if (reminders.length === 0 && isLiveWatch && (suggestions.length > 0 || Boolean(parsed?.dataPlatePrompt?.needed))) {
      reminders = sectionFallbackReminders(currentSection, isLiveWatch);
    }

    const limitations = Array.isArray(parsed?.limitations)
      ? parsed.limitations
          .slice(0, 6)
          .filter((item: any) => !isLiveWatch || normalizeConfidence(item?.confidence, 0) >= 0.6)
          .map((item: any, index: number) =>
            cleanLimitation(item, index, currentSection),
          )
      : [];

    const localizedLimitationSuggestions =
      suggestions.length === 0
        ? limitations
            .filter((item: any) => Boolean(item.region))
            .map((item: any, index: number) =>
              cleanSuggestion(
                {
                  id: `limitation-visual-${item.id || index}`,
                  title: item.title,
                  section: item.section || currentSection,
                  severity: "Informational",
                  observation: item.limitation,
                  implication: item.reason,
                  recommendation: item.recommendation,
                  confidence: item.confidence,
                  suggestionType: "documentation",
                  region: item.region,
                },
                index,
              ),
            )
        : [];

    const finalSuggestions = [...suggestions, ...localizedLimitationSuggestions].slice(0, 6);

    const dataPlatePrompt = parsed?.dataPlatePrompt || {};
    const cleanDataPlatePrompt = {
      needed: Boolean(dataPlatePrompt?.needed),
      reason: cleanText(dataPlatePrompt?.reason),
      equipmentType: cleanText(dataPlatePrompt?.equipmentType),
    };

    return NextResponse.json({
      area: cleanText(parsed?.area) || cleanText(parsed?.system) || currentSection,
      system: cleanText(parsed?.system) || "",
      confidence: normalizeConfidence(parsed?.confidence),
      summary: cleanText(parsed?.summary),
      suggestions: finalSuggestions,
      reminders,
      limitations,
      dataPlatePrompt: cleanDataPlatePrompt,
      mode,
      model: brainResult.model,
    });
  } catch (error: any) {
    console.error("AI live inspection camera error:", error);

    return NextResponse.json(
      {
        error: error?.message || "AI Live Inspection Camera failed.",
      },
      { status: 500 },
    );
  }
}

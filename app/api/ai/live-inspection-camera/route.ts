import { NextResponse } from "next/server";
import { inspectionBrain } from "../../../../lib/ai";
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

  return {
    id:
      cleanText(value?.id) ||
      `limitation-${section}-${index + 1}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    title: cleanText(value?.title) || "Inspection Limitation",
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
    const currentSection = cleanText(body.currentSection) || "Exterior";
    const currentSeverity = cleanText(body.currentSeverity) || "Recommended Repair";
    const mode = cleanText(body.mode) || "manual";
    const isLiveWatch = mode === "live_watch";

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Missing imageDataUrl." },
        { status: 400 },
      );
    }

    const image = imageDataUrlParts(imageDataUrl);

    const systemPrompt = `
You are On Point AI Second Inspector, a senior home inspection assistant watching a live inspection camera frame.

You are suggestions-only. Never say a defect is saved. Never imply the inspector must write something up.
The inspector must approve every finding before anything is saved.

Analyze the frame for:
1. The current area/system.
2. Multiple visible possible defects or reportable conditions in the same area.
3. Inspection limitations such as personal belongings, stored items, blocked access, inaccessible areas, snow/debris coverage, locked rooms, low clearance, unsafe access, utilities off, or components not fully visible.
4. Inspection reminders before walking away.
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
      "suggestionType": "defect | safety | maintenance | documentation"
    }
  ],
  "reminders": [
    {
      "id": "",
      "title": "",
      "detail": "",
      "priority": "low | medium | high",
      "action": "check | document | photo | scan_data_plate",
      "confidence": 0.0
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

Analyze this live inspection camera frame.

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

    const suggestions = (isLiveWatch ? filterForLiveWatch(rawSuggestions) : rawSuggestions)
      .slice(0, 6)
      .map(cleanSuggestion);

    const reminders = Array.isArray(parsed?.reminders)
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

    const limitations = Array.isArray(parsed?.limitations)
      ? parsed.limitations
          .slice(0, 6)
          .filter((item: any) => !isLiveWatch || normalizeConfidence(item?.confidence, 0) >= 0.76)
          .map((item: any, index: number) =>
            cleanLimitation(item, index, currentSection),
          )
      : [];

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
      suggestions,
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

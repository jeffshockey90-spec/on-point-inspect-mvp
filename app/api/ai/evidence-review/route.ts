import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {}

  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return valid evidence-review JSON.");
  return JSON.parse(match[0]);
}

function clampScore(value: unknown, fallback = 70) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(100, number)));
}

function cleanRating(
  value: unknown,
): "good" | "acceptable" | "poor" {
  const rating = String(value || "").toLowerCase();
  if (rating === "good" || rating === "poor") return rating;
  return "acceptable";
}

function cleanDistance(
  value: unknown,
): "good" | "too_far" | "too_close" | "unknown" {
  const distance = String(value || "").toLowerCase();
  if (
    distance === "good" ||
    distance === "too_far" ||
    distance === "too_close"
  ) {
    return distance;
  }
  return "unknown";
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "AI evidence validation is not configured.",
          message: "The photo can still be saved without validation.",
        },
        { status: 503 },
      );
    }

    const body = await request.json();
    const imageDataUrl = String(body?.imageDataUrl || "");
    const subject = String(body?.subject || "inspection evidence");
    const section = String(body?.section || "Unknown");
    const evidenceType = String(body?.evidenceType || "documentation");
    const requiredElements = Array.isArray(body?.requiredElements)
      ? body.requiredElements.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "A valid evidence image is required." },
        { status: 400 },
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a senior home-inspection photo quality reviewer.

Determine whether a REAL inspection photo is usable evidence. Be strict enough
to prevent incomplete reports, but do not reject a clear photo merely because
it is not artistic.

Review:
- sharpness/focus
- lighting and glare
- framing and surrounding location context
- camera distance
- whether the intended subject is visible
- whether the requested evidence is actually shown

Do not diagnose hidden defects. Do not invent objects that are not visible.

A photo is usable only when:
1. the intended subject or condition is visible,
2. the image is sufficiently clear,
3. enough context exists to understand the location, and
4. the required evidence is satisfied.

Return only JSON:
{
  "usable": true,
  "overallScore": 0,
  "sharpness": "good | acceptable | poor",
  "lighting": "good | acceptable | poor",
  "framing": "good | acceptable | poor",
  "distance": "good | too_far | too_close | unknown",
  "subjectVisible": true,
  "requiredEvidenceSatisfied": true,
  "missingElements": [],
  "guidance": "One short, direct instruction to the inspector.",
  "confidence": 0.0
}
          `.trim(),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Section: ${section}
Evidence type: ${evidenceType}
Intended subject: ${subject}
Required elements:
${
  requiredElements.length
    ? requiredElements.map((item: string) => `- ${item}`).join("\n")
    : "- Clear, useful documentation of the intended subject"
}

Review this image as inspection-report evidence.
              `.trim(),
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const parsed = safeJsonParse(
      response.choices[0]?.message?.content || "{}",
    );

    const subjectVisible = Boolean(parsed.subjectVisible);
    const requiredEvidenceSatisfied = Boolean(
      parsed.requiredEvidenceSatisfied,
    );
    const sharpness = cleanRating(parsed.sharpness);
    const lighting = cleanRating(parsed.lighting);
    const framing = cleanRating(parsed.framing);
    const overallScore = clampScore(parsed.overallScore);
    const usable =
      Boolean(parsed.usable) &&
      subjectVisible &&
      requiredEvidenceSatisfied &&
      sharpness !== "poor" &&
      overallScore >= 65;

    return NextResponse.json({
      review: {
        usable,
        overallScore,
        sharpness,
        lighting,
        framing,
        distance: cleanDistance(parsed.distance),
        subjectVisible,
        requiredEvidenceSatisfied,
        missingElements: Array.isArray(parsed.missingElements)
          ? parsed.missingElements
              .map((item: unknown) => String(item).trim())
              .filter(Boolean)
              .slice(0, 6)
          : [],
        guidance:
          String(parsed.guidance || "").trim() ||
          (usable
            ? "Evidence is clear and usable."
            : "Retake the photo closer and keep the subject in focus."),
        confidence: Math.max(
          0,
          Math.min(1, Number(parsed.confidence) || 0.75),
        ),
      },
    });
  } catch (error: any) {
    const info = classifyAIServiceError(error);
    console.error("AI evidence review failed:", {
      code: info.code,
      status: info.status,
      technicalMessage: info.technicalMessage,
    });

    return NextResponse.json(
      {
        error: info.title,
        message: info.message,
        code: info.code,
        retryable: info.retryable,
      },
      { status: info.status },
    );
  }
}

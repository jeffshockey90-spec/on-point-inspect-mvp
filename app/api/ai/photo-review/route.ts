import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  routeFindingSection,
  normalizeSeverity,
} from "../../../../lib/routeFindingSection";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  if (!match) {
    throw new Error("AI did not return valid JSON.");
  }

  return JSON.parse(match[0]);
}

function cleanConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.7;
  }

  if (value < 0) return 0;
  if (value > 1) return 1;

  return value;
}

export async function POST(req: Request) {
  try {
    const { imageUrl, caption, currentSection } =
      await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl." },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are a senior licensed home inspector writing professional inspection findings from images.

You are analyzing REAL inspection photos.

Your job:
- Visually inspect the image carefully.
- Use the inspector caption/note if provided.
- Identify likely visible defects or concerns.
- Use professional home inspection language.
- Be factual and non-alarmist.
- Do not overstate hidden conditions.
- Never claim code compliance.
- Never say the house passes or fails.
- Never diagnose mold, asbestos, structural failure, or hidden leaks unless clearly visible.
- Use cautious wording like:
  - appeared
  - was observed
  - may indicate
  - unable to confirm
  - recommend further evaluation

VERY IMPORTANT:
You MUST determine:
- the most accurate section
- the severity
- the defect title
- observation
- implication
- recommendation

VALID SECTIONS:
- Exterior
- Roof
- Basement, Foundation, Crawlspace & Structure
- Heating
- Cooling
- Plumbing
- Electrical
- Fireplace
- Attic, Insulation & Ventilation
- Doors, Windows & Interior
- Built-in Appliances
- Garage

VALID SEVERITIES:
- Informational
- Monitor
- Maintenance
- Recommended Repair
- Safety Concern
- Major Concern

WRITING FORMAT:

Observation:
- Describe visible conditions only
- Mention location/materials/components
- Mention limitations if visibility is poor

Implication:
- Explain why it matters
- Explain possible consequences
- Mention safety/property concerns if applicable

Recommendation:
- Explain corrective action
- Recommend qualified professional if needed
- Use professional inspection wording

RETURN ONLY VALID JSON:

{
  "section": "",
  "severity": "",
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "confidence": 0.0,
  "limitations": ""
}
          `,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Inspector note:
${caption || "No note provided."}

Current selected section:
${currentSection || "Unknown"}

Analyze this inspection image carefully and generate a professional finding.
              `,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      temperature: 0.3,
    });

    const text =
      response.choices[0].message.content || "";

    console.log("🤖 AI VISION RAW:", text);

    const parsed = safeJsonParse(text);

    const routedSection = routeFindingSection({
      section: parsed.section,
      title: parsed.title,
      observation: parsed.observation,
      implication: parsed.implication,
      recommendation: parsed.recommendation,
    });

    const normalizedSeverity = normalizeSeverity(
      parsed.severity
    );

    const result = {
      section: routedSection,
      severity: normalizedSeverity,

      title:
        typeof parsed.title === "string" &&
        parsed.title.trim()
          ? parsed.title.trim()
          : "Inspection Finding",

      observation:
        typeof parsed.observation === "string"
          ? parsed.observation.trim()
          : "A visible condition was observed during the inspection.",

      implication:
        typeof parsed.implication === "string"
          ? parsed.implication.trim()
          : "The significance of the condition could not be fully determined from the image alone.",

      recommendation:
        typeof parsed.recommendation === "string"
          ? parsed.recommendation.trim()
          : "Recommend further evaluation and correction by a qualified professional as needed.",

      confidence: cleanConfidence(parsed.confidence),

      limitations:
        typeof parsed.limitations === "string"
          ? parsed.limitations.trim()
          : "",
    };

    console.log("✅ FINAL AI VISION RESULT:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI photo review error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI photo review failed.",
      },
      { status: 500 }
    );
  }
}
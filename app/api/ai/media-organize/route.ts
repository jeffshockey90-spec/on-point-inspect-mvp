import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { getAIModel } from "../../../../lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function clean(value: unknown) {
  return String(value || "").trim();
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {}

  const cleaned = value.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return valid JSON.");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];
    const currentSection = VALID_SECTIONS.includes(body.currentSection)
      ? body.currentSection
      : "Exterior";

    if (!images.length) {
      return NextResponse.json(
        { error: "Add at least one photo to organize." },
        { status: 400 },
      );
    }

    const imageContent = images.flatMap((item: any, index: number) => [
      {
        type: "text" as const,
        text: `PHOTO INDEX ${index}: ${clean(item.name) || `Photo ${index + 1}`}`,
      },
      {
        type: "image_url" as const,
        image_url: {
          url: clean(item.dataUrl),
          detail: "low" as const,
        },
      },
    ]);

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You organize batches of real home-inspection photos.

Group photos that document the SAME condition or component into one draft finding.
Examples:
- panel overview, main disconnect, and directory may be separate informational/documentation groups unless they show one defect.
- several angles of the same damaged roof area belong in one group.
- do not invent defects.
- use calm, professional inspection language.
- uncertain photos should be returned in an "Unassigned" group and not turned into a defect.
- photoIndexes must reference the supplied zero-based indexes exactly.

Return ONLY JSON:
{
  "groups": [
    {
      "id": "group-1",
      "label": "",
      "photoIndexes": [0],
      "classification": "finding|reference|equipment|limitation|unassigned",
      "section": "",
      "severity": "",
      "title": "",
      "observation": "",
      "implication": "",
      "recommendation": "",
      "confidence": 0.0
    }
  ]
}

Valid sections:
${VALID_SECTIONS.join(", ")}

Valid severities:
${VALID_SEVERITIES.join(", ")}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Current section: ${currentSection}
Organize these photos into sensible inspection groups. Do not overstate image-only conclusions.`,
            },
            ...imageContent,
          ],
        },
      ],
    });

    const parsed = safeJsonParse(
      response.choices[0]?.message?.content || "{}",
    );

    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.map((group: any, index: number) => {
          const indexes = Array.isArray(group.photoIndexes)
            ? group.photoIndexes
                .map(Number)
                .filter(
                  (value: number) =>
                    Number.isInteger(value) &&
                    value >= 0 &&
                    value < images.length,
                )
            : [];

          const classification = [
            "finding",
            "reference",
            "equipment",
            "limitation",
            "unassigned",
          ].includes(clean(group.classification))
            ? clean(group.classification)
            : "unassigned";

          return {
            id: clean(group.id) || `group-${index + 1}`,
            label: clean(group.label) || `Photo Group ${index + 1}`,
            photoIndexes: indexes,
            classification,
            section: VALID_SECTIONS.includes(clean(group.section))
              ? clean(group.section)
              : currentSection,
            severity: VALID_SEVERITIES.includes(clean(group.severity))
              ? clean(group.severity)
              : "Recommended Repair",
            title: clean(group.title) || clean(group.label) || "Inspection Finding",
            observation: clean(group.observation),
            implication: clean(group.implication),
            recommendation: clean(group.recommendation),
            confidence: Math.max(
              0,
              Math.min(1, Number(group.confidence || 0.7)),
            ),
          };
        })
      : [];

    return NextResponse.json({ success: true, groups });
  } catch (error: any) {
    const classified = classifyAIServiceError(error);
    return NextResponse.json(
      {
        error: classified.message,
        title: classified.title,
        code: classified.code,
        retryable: classified.retryable,
      },
      { status: classified.status },
    );
  }
}

import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  routeFindingSection,
  normalizeSeverity,
} from "../../../lib/routeFindingSection";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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

function safeParseAI(input: string) {
  try {
    return JSON.parse(input);
  } catch {}

  const cleaned = input
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);

  throw new Error("AI returned invalid JSON");
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const mode = String(body?.mode || "create_finding");
    const isRewrite = mode === "rewrite_existing_finding";
    const structuredFinding = body?.finding || {};

    const inspectorCorrection = cleanText(
      body?.inspectorCorrection || body?.inspector_note || body?.note,
    );

    const current = {
      title: cleanText(structuredFinding?.title || body?.title, "Inspection Finding"),
      observation: cleanText(structuredFinding?.observation || body?.observation),
      implication: cleanText(structuredFinding?.implication || body?.implication),
      recommendation: cleanText(
        structuredFinding?.recommendation || body?.recommendation,
      ),
      section: cleanText(
        structuredFinding?.section || body?.section,
        "Inspection Details",
      ),
      severity: cleanText(
        structuredFinding?.severity || body?.severity,
        "Recommended Repair",
      ),
    };

    if (!inspectorCorrection) {
      return NextResponse.json(
        { error: "Inspector note is required" },
        { status: 400 },
      );
    }

    const taskInstructions = isRewrite
      ? `
TASK: EDIT AN EXISTING FINDING.

The inspector correction is the controlling instruction. The current finding is the source material.
Do not create a different defect and do not base the rewrite mainly on the title.
Read the observation, implication, and recommendation together before making changes.
Preserve every field the inspector did not ask to change.
Only change the section or severity when the correction clearly requires it.
Do not invent facts, damage, measurements, code violations, causes, concealed conditions, or contractor conclusions.
Keep the same professional, non-alarmist meaning unless the inspector specifically asks to change it.
`
      : `
TASK: CREATE A COMPLETE FINDING FROM THE INSPECTOR NOTE.
Use the current fields as supporting context when present.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a senior licensed home inspector editing professional home-inspection report findings.

Return only valid JSON with exactly these string fields:
{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "section": "",
  "severity": ""
}

VALID REPORT SECTIONS:
${VALID_SECTIONS.map((item) => `- ${item}`).join("\n")}

VALID SEVERITIES:
- Informational
- Monitor
- Maintenance
- Recommended Repair
- Safety Concern
- Major Concern

RULES:
- Never use General or Safety as a section.
- Safety is a severity, not a section.
- Observation states only what was visible, tested, measured, or reported.
- Implication explains why the observation matters without exaggeration.
- Recommendation gives a practical next step and identifies a qualified professional when appropriate.
- Do not say the home passes or fails.
- Do not advise whether the client should buy the home.
- Do not claim code noncompliance unless the inspector explicitly states it.
- Use professional, clear, realtor-friendly, non-alarmist language.
- Do not add facts that are not present in the inspector note or current finding.
${taskInstructions}
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              mode,
              inspectorCorrection,
              currentFinding: current,
              explicitInstructions: body?.instructions || [],
            },
            null,
            2,
          ),
        },
      ],
      temperature: isRewrite ? 0.15 : 0.35,
    });

    const text = response.choices[0]?.message?.content || "";
    const parsed = safeParseAI(text);

    // For an existing finding, preserve the current section unless AI returns a
    // valid section. For a new finding, use the normal routing helper.
    const requestedSection = cleanText(parsed?.section, current.section);
    const finalSection = isRewrite
      ? VALID_SECTIONS.includes(requestedSection)
        ? requestedSection
        : current.section
      : routeFindingSection({
          section: requestedSection,
          title: parsed?.title,
          observation: parsed?.observation,
          implication: parsed?.implication,
          recommendation: parsed?.recommendation,
        });

    const requestedSeverity = cleanText(parsed?.severity, current.severity);

    const finalResult = {
      title: cleanText(parsed?.title, current.title),
      observation: cleanText(parsed?.observation, current.observation),
      implication: cleanText(parsed?.implication, current.implication),
      recommendation: cleanText(
        parsed?.recommendation,
        current.recommendation,
      ),
      section: finalSection,
      severity: normalizeSeverity(requestedSeverity),
    };

    return NextResponse.json(finalResult);
  } catch (err: any) {
    console.error("AI adjust finding route error:", err);

    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}

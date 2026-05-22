import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  routeFindingSection,
  normalizeSeverity,
} from "../../../lib/routeFindingSection";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =========================
   SAFE JSON PARSER
========================= */
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
  if (match) {
    return JSON.parse(match[0]);
  }

  throw new Error("AI returned invalid JSON");
}

export async function POST(req: Request) {
  try {
    console.log("🔥 AI ROUTE HIT");

    const body = await req.json();

    const {
      note,
      title,
      observation,
      implication,
      recommendation,
      section,
      severity,
    } = body;

    if (!note || note.trim() === "") {
      return NextResponse.json(
        { error: "Inspector note is required" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a senior licensed home inspector writing professional inspection report findings.

You write in the style of a clear, detailed, realtor-friendly home inspection report.

IMPORTANT:
- Return ONLY valid JSON.
- Do NOT use markdown.
- Do NOT wrap the response in code fences.
- Do NOT add explanations outside JSON.
- Do NOT use "General" as a section.
- Do NOT use "Safety" as a section.
- Safety is a severity/tag, not a report section.
- General is a severity/tag, not a report section.

VALID REPORT SECTIONS:
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

WRITING RULES:
- Title should be short, clear, and inspection-style.
- Observation must only describe what is visible or reported.
- Implication must explain why it matters and possible consequences.
- Recommendation must explain the next step and who should evaluate/repair.
- Keep the language professional and non-alarmist.
- Do not say the home passes or fails.
- Do not advise whether the client should buy the home.
- Do not claim code compliance unless directly stated by the inspector.
- Use "recommend further evaluation and correction by a qualified contractor/professional as needed" where appropriate.
- Each Observation, Implication, and Recommendation should be detailed but not bloated.
- Prefer 3–6 strong sentences per section.

Return this exact JSON structure:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "section": "",
  "severity": ""
}
          `,
        },
        {
          role: "user",
          content: `
Create or rewrite this inspection finding into a complete professional report comment.

INSPECTOR NOTE:
${note}

CURRENT FINDING INFO:
Title: ${title || ""}
Observation: ${observation || ""}
Implication: ${implication || ""}
Recommendation: ${recommendation || ""}
Section: ${section || ""}
Severity: ${severity || ""}

IMPORTANT ROUTING RULES:
- Choose the best matching section from the valid section list.
- If the issue is electrical, use Electrical.
- If the issue is plumbing, use Plumbing.
- If the issue is roof covering, flashing, gutters, chimney, soffit, or fascia, use Roof.
- If the issue is siding, grading, decks, porches, exterior trim, walkways, or driveways, use Exterior.
- If the issue is furnace, boiler, heating equipment, flue, or heating distribution, use Heating.
- If the issue is AC, condenser, evaporator, refrigerant, heat pump cooling mode, or cooling equipment, use Cooling.
- If the issue is foundation, crawlspace, basement, joists, beams, piers, moisture in crawlspace, or structural support, use Basement, Foundation, Crawlspace & Structure.
- If the issue is attic, insulation, ventilation, bath fan ducting, or attic access, use Attic, Insulation & Ventilation.
- If the issue is doors, windows, floors, walls, ceilings, stairs, handrails, guardrails, or interior finishes, use Doors, Windows & Interior.
- If the issue is dishwasher, range, oven, microwave, disposal, or built-in appliance, use Built-in Appliances.
- If the issue is garage door, opener, auto-reverse, photo eyes, or garage firewall, use Garage.
- Never return "General" as the section.
- Never return "Safety" as the section.
- If something is a safety issue, put "Safety Concern" in severity.

Return ONLY valid JSON.
          `,
        },
      ],
      temperature: 0.4,
    });

    const text = response.choices[0].message.content || "";

    console.log("🤖 RAW AI RESPONSE:", text);

    const parsed = safeParseAI(text);

    const routedSection = routeFindingSection({
      section: parsed.section,
      title: parsed.title,
      observation: parsed.observation,
      implication: parsed.implication,
      recommendation: parsed.recommendation,
    });

    const normalizedSeverity = normalizeSeverity(parsed.severity);

    const finalResult = {
      title: parsed.title || title || "Inspection Finding",
      observation: parsed.observation || observation || "",
      implication: parsed.implication || implication || "",
      recommendation: parsed.recommendation || recommendation || "",
      section: routedSection,
      severity: normalizedSeverity,
    };

    console.log("✅ FINAL ROUTED RESULT:", finalResult);

    return NextResponse.json(finalResult);
  } catch (err: any) {
    console.error("❌ AI ROUTE ERROR:", err);

    return NextResponse.json(
      {
        error: err.message || "Server error",
      },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { getAIModel } from "../../../lib/openai";
import { getSessionUser } from "../../../lib/apiAuth";
import { loadFlowStyle } from "../../../lib/ai/flowWriter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { note } = body;

    if (!note) {
      return NextResponse.json({ error: "Missing note" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // Best-effort attribution so the reusable template is written in this
    // inspector's voice + learned edits (templates aren't tied to an inspection).
    const sessionUser = await getSessionUser();
    const { styleGuidance } = await loadFlowStyle({
      userId: sessionUser?.id ?? null,
      inspectionId: null,
      draft: { note, section: body.section ?? null },
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getAIModel(),
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content: `
You are a senior certified home inspector writing reusable inspection finding templates.

Return ONLY valid JSON with this exact structure:
{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Allowed sections:
Exterior
Roof
Basement, Foundation, Crawlspace & Structure
Heating
Cooling
Plumbing
Electrical
Attic, Insulation & Ventilation
Doors, Windows & Interior
Built-in Appliances
Garage

Allowed severity:
Safety / Major Concern
Recommended Repair
Maintenance / Monitor
Informational

Write professional, detailed, realtor-friendly language.
Do not be alarmist.
Use Observation, Implication, and Recommendation style.
${styleGuidance ? `\n${styleGuidance}\n` : ""}
            `,
          },
          {
            role: "user",
            content: `Create a reusable inspection finding template from this quick inspector note: ${note}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No AI response generated" },
        { status: 500 }
      );
    }

    const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate template" },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionUser } from "../../../lib/apiAuth";
import { loadFlowWriter } from "../../../lib/ai/flowWriter";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageUrl = body.imageUrl;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl" },
        { status: 400 }
      );
    }

    // Best-effort attribution so the shared FLOW Writer brain can load this
    // inspector's voice, learning, and examples.
    const sessionUser = await getSessionUser();
    const attributedUserId = sessionUser?.id ?? null;
    const inspectionId = body.inspectionId || body.inspection_id || null;

    // Build the shared FLOW Writer brain, then layer the data-plate reading
    // discipline and the EXACT output JSON contract this route parses on top.
    const { systemPrompt } = await loadFlowWriter({
      userId: attributedUserId,
      inspectionId,
      extra: `INPUT: ONE equipment data-plate photo (HVAC, water heater, appliance, or electrical). Return JSON only.

Read the data plate carefully: brand/manufacturer marks, model number, serial number, manufacture date, capacity, fuel type, voltage, amperage, refrigerant, and efficiency. Focus heavily on OCR of the visible label. Never invent a serial number, model number, manufacture date, or any spec — leave the field as "" when it is not legible.

Image-narration discipline: describe the equipment itself, not the photo.

Return ONLY valid JSON in this exact format (return every key):

{
  "title": "",
  "brand": "",
  "model": "",
  "serial": "",
  "equipment_type": "",
  "manufacture_date": "",
  "estimated_age": "",
  "capacity": "",
  "fuel_type": "",
  "voltage": "",
  "amperage": "",
  "refrigerant": "",
  "efficiency": "",
  "notes": ""
}`,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },

      messages: [
        {
          role: "system",
          content: systemPrompt,
        },

        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Read this equipment data plate photo.

Return ONLY valid JSON in this exact format:

{
  "title": "",
  "brand": "",
  "model": "",
  "serial": "",
  "equipment_type": "",
  "manufacture_date": "",
  "estimated_age": "",
  "capacity": "",
  "fuel_type": "",
  "voltage": "",
  "amperage": "",
  "refrigerant": "",
  "efficiency": "",
  "notes": ""
}
`,
            },

            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to scan data plate",
      },
      {
        status: 500,
      }
    );
  }
}
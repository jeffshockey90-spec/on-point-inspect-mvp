import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json(
        { error: "No image uploaded" },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert home inspection equipment analyst. Return ONLY valid JSON. Be accurate, conservative, and use Unknown when information cannot be confirmed from the photo.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze this equipment photo.

Return ONLY valid JSON in this exact format:

{
  "equipmentType": "",
  "manufacturer": "",
  "model": "",
  "serial": "",
  "manufactureYear": "",
  "estimatedAge": "",
  "efficiency": "",
  "capacity": "",
  "fuelType": "",
  "refrigerant": "",
  "condition": "",
  "estimatedLifeRemaining": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Section must be one of:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage, General.

Severity must be one of:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.

Rules:
- Furnace, boiler, air handler, or heating equipment = Heating
- AC condenser, heat pump, mini split, or cooling equipment = Cooling
- Electrical panel, disconnect, breaker, service equipment = Electrical
- Water heater, tankless water heater, expansion tank, or plumbing equipment = Plumbing
- Dishwasher, refrigerator, range, oven, cooktop, garbage disposal = Built-in Appliances
- Garage door equipment = Garage
- If information is not visible, use "Unknown"
- Do not guess manufacture year unless the photo or serial pattern clearly supports it
- Recommendations should be clear, professional, and not overly alarmist
              `,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.type};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });

    const text = result.choices[0]?.message?.content || "{}";

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        error: "AI did not return valid JSON",
        raw: text,
      };
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Analyze equipment error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to analyze equipment",
      },
      { status: 500 }
    );
  }
}
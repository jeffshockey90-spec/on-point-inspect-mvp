import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
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

    const result = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `
You are an expert home inspection equipment analyst.

Analyze equipment photos for a professional home inspection report.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside the JSON.

Be accurate but conservative.
If information cannot be confirmed from the photo, use "Unknown".

Write findings in a professional, realtor-friendly home inspection style.
          `,
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Analyze this equipment photo.

Identify:
- equipment type
- manufacturer
- model number
- serial number
- manufacture year if possible
- estimated age if possible
- efficiency rating if visible
- capacity/tonnage/BTU if visible
- fuel type
- refrigerant type if visible
- condition based only on visible information
- proper report section
- severity level
- inspection finding language

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
- Exterior
- Roof
- Basement, Foundation, Crawlspace & Structure
- Heating
- Cooling
- Plumbing
- Electrical
- Attic, Insulation & Ventilation
- Doors, Windows & Interior
- Built-in Appliances
- Garage
- General

Severity must be one of:
- Informational
- Monitor
- Repair
- Safety

Rules:
- Furnace, boiler, air handler, or heating equipment = Heating
- AC condenser, heat pump, mini split, or cooling equipment = Cooling
- Electrical panel, disconnect, breaker, service equipment = Electrical
- Water heater, tankless water heater, expansion tank, or plumbing equipment = Plumbing
- Dishwasher, refrigerator, range, oven, cooktop, garbage disposal = Built-in Appliances
- Garage door equipment = Garage
- Attic fan, bath fan, exhaust fan, insulation, ventilation equipment = Attic, Insulation & Ventilation
- If R22 refrigerant is visible, severity should be Monitor
- If active leakage, burning, corrosion at electrical connections, missing covers, or exposed energized components are visible, severity should be Safety
- If equipment is near or past typical service life, severity should be Monitor
- If information is not visible, use "Unknown"
- Do not guess manufacture year unless the photo or serial pattern clearly supports it
- Recommendations should be clear, professional, and not overly alarmist
              `,
            },
            {
              type: "input_image",
              image_url: `data:${image.type};base64,${base64Image}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    const text = result.output_text || "{}";

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
  } catch (error) {
    console.error("Analyze equipment error:", error);

    return NextResponse.json(
      { error: "Failed to analyze equipment" },
      { status: 500 }
    );
  }
}
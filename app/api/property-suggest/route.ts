import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = body.input || "";

    if (!input || input.length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        suggestions: [],
        error: "Missing Google key",
      });
    }

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&types=address&components=country:us&key=${apiKey}`;

    const googleResponse = await fetch(url);
    const googleText = await googleResponse.text();

    if (!googleText) {
      return NextResponse.json({
        suggestions: [],
        error: "Empty Google response",
      });
    }

    const data = JSON.parse(googleText);

    const suggestions =
      data.predictions?.map((item: any) => ({
        description: item.description,
        place_id: item.place_id,
      })) || [];

    return NextResponse.json({
      suggestions,
      status: data.status || "UNKNOWN",
      error: data.error_message || null,
    });
  } catch (error: any) {
    return NextResponse.json({
      suggestions: [],
      error: error?.message || "Property suggest failed",
    });
  }
}
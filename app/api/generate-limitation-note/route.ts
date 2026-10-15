import { NextResponse } from "next/server";
import { generateLimitationNote } from "../../../lib/ai/limitationNote";

export async function POST(req: Request) {
  try {
    const { section, notes, selectedLimitations } = await req.json();

    if (!notes) {
      return NextResponse.json({ error: "Missing limitation notes." }, { status: 400 });
    }

    const { title, comment } = await generateLimitationNote({
      section,
      notes,
      selectedLimitations,
    });

    return NextResponse.json({ title, comment });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate limitation note." },
      { status: 500 },
    );
  }
}

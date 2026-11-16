import { NextResponse } from "next/server";
import { generateLimitationNote } from "../../../lib/ai/limitationNote";
import { guardAiRequest } from "../../../lib/aiGuard";

export async function POST(req: Request) {
  // Paid API call (OpenAI / Google / RentCast): signed-in users only — it was
  // callable by anyone, so a script could drain the budget. See lib/aiGuard.
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;
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

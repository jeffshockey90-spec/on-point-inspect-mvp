import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { getAIModel } from "../../../../lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// AI ballpark repair-cost estimates per finding, to seed the repair-request /
// credit workflow. These are rough planning ranges, NOT formal quotes -- the
// UI labels them as estimates and the inspector can edit before sending.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const region = String(body?.region || "").trim();
    const items = Array.isArray(body?.findings) ? body.findings.slice(0, 40) : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "No findings provided." }, { status: 400 });
    }

    const compact = items.map((f: any) => ({
      id: String(f?.id ?? ""),
      title: String(f?.title || "").slice(0, 200),
      severity: String(f?.severity || ""),
      section: String(f?.section || ""),
      location: String(f?.location || ""),
      observation: String(f?.observation || "").slice(0, 600),
    }));

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an experienced general contractor and home-repair cost estimator. " +
            "For each home-inspection finding, give a realistic ballpark repair or replacement " +
            "cost RANGE in US dollars as a rough planning estimate — NOT a formal quote. " +
            "Base it on typical local labor + material costs for the region provided, the finding's " +
            "severity, and the described defect. Be practical and conservative; avoid extreme highs. " +
            'For purely informational or "monitor" items with no clear repair, use 0 for both low and high. ' +
            'Return ONLY JSON of the form {"estimates":{"<id>":{"low":<number>,"high":<number>}}} with an ' +
            "entry for every finding id given. Whole dollars, no currency symbols or text.",
        },
        {
          role: "user",
          content:
            `Region: ${region || "United States (national average)"}\n\n` +
            `Findings (JSON):\n${JSON.stringify(compact)}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const rawEstimates = parsed?.estimates && typeof parsed.estimates === "object" ? parsed.estimates : {};

    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    };
    const estimates: Record<string, { low: number; high: number }> = {};
    for (const item of compact) {
      const e = rawEstimates[item.id] || {};
      let low = num(e.low);
      let high = num(e.high);
      if (high < low) [low, high] = [high, low];
      estimates[item.id] = { low, high };
    }

    return NextResponse.json({ estimates });
  } catch (error: any) {
    console.error("Repair estimate error:", error);
    const classified = classifyAIServiceError(error);
    return NextResponse.json(
      { error: classified.message, code: classified.code, retryable: classified.retryable },
      { status: classified.status },
    );
  }
}

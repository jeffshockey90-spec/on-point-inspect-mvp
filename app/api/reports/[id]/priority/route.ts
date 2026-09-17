import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getSessionUser, authorizeInspection } from "../../../../../lib/apiAuth";
import { getAIModel } from "../../../../../lib/openai";
import { logAIEvent } from "../../../../../lib/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fallback ordering when the AI can't rank (or for findings it omitted):
// most-serious severity first.
const SEVERITY_RANK: Record<string, number> = {
  "Major Concern": 0,
  "Safety Concern": 1,
  "Recommended Repair": 2,
  "Maintenance": 3,
  "Monitor": 4,
  "Informational": 5,
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function severityRank(s: any) {
  const r = SEVERITY_RANK[clean(s)];
  return r === undefined ? 3 : r;
}

async function loadContext(id: string) {
  const { data: inspection } = await admin
    .from("inspections")
    .select("id, priority_summary, priority_summary_visible")
    .eq("id", id)
    .maybeSingle();
  return inspection;
}

// GET — current stored summary + visibility.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await authorizeInspection(admin, user.id, id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const inspection = await loadContext(id);
  return NextResponse.json({
    summary: inspection?.priority_summary || null,
    visible: Boolean(inspection?.priority_summary_visible),
  });
}

// PATCH — toggle client visibility and/or persist a manually reordered list.
// Body: { visible?: boolean, items?: [{ findingId, reason }] }.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await authorizeInspection(admin, user.id, id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  if (typeof body.visible === "boolean") patch.priority_summary_visible = body.visible;

  // A manual reorder from the builder. Keep only real finding ids for this
  // inspection, deduped, and preserve the sent order.
  if (Array.isArray(body.items)) {
    const { data: findings } = await admin
      .from("findings")
      .select("id")
      .eq("inspection_id", id);
    const valid = new Set((findings || []).map((f: any) => String(f.id)));
    const seen = new Set<string>();
    const items: { findingId: string; reason: string }[] = [];
    for (const row of body.items) {
      const fid = clean(row?.findingId);
      if (!valid.has(fid) || seen.has(fid)) continue;
      seen.add(fid);
      items.push({ findingId: fid, reason: clean(row?.reason).slice(0, 240) });
    }
    const existing = await loadContext(id);
    const generatedAt = (existing?.priority_summary as any)?.generatedAt || new Date().toISOString();
    patch.priority_summary = { generatedAt, items };
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { error } = await admin.from("inspections").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST — (re)generate the AI priority ordering for every finding.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await authorizeInspection(admin, user.id, id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });

  const { data: findings } = await admin
    .from("findings")
    .select("id, title, section, severity, observation, implication, recommendation")
    .eq("inspection_id", id)
    .order("created_at", { ascending: true });

  const list = (findings || []).filter((f: any) => clean(f.title) || clean(f.observation));
  if (list.length === 0)
    return NextResponse.json({ error: "No findings to prioritize yet." }, { status: 400 });

  // Compact each finding for the model; keep the id as the join key.
  const forModel = list.map((f: any) => ({
    id: String(f.id),
    title: clean(f.title),
    section: clean(f.section),
    severity: clean(f.severity),
    observation: clean(f.observation).slice(0, 500),
    implication: clean(f.implication).slice(0, 300),
    recommendation: clean(f.recommendation).slice(0, 300),
  }));

  const systemPrompt = `You are prioritizing the findings from a completed U.S. home inspection so a buyer can see what to address first.
Rank EVERY finding from highest priority (1) to lowest, using this order of importance:
1) Immediate safety of occupants (shock, fire, gas, CO, fall, structural failure, no egress).
2) Major or costly defects, or a system at or near the end of its serviceable life.
3) Active problems causing damage now (water intrusion, leaks).
4) Other recommended repairs.
5) Routine maintenance items.
6) Monitor and informational notes last.
Within a tier, put the higher-consequence or more time-sensitive item first.

For each finding write a short (max ~18 words), client-readable "reason" explaining WHY it ranks where it does.
Liability rules for the reason — these are absolute:
- Never say a component WILL fail or give a specific deadline or timeframe.
- Never promise or estimate repair costs.
- Frame in terms of safety, function, or typical service life; keep it factual and non-alarming.

Return ONLY JSON: {"order":[{"id":"<finding id>","reason":"<one line>"}]}. Include EVERY finding id exactly once. No text outside JSON.`;

  const userPrompt = `Findings (JSON):\n${JSON.stringify(forModel)}`;

  let parsed: any = {};
  try {
    const response = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 2000,
    });
    const raw = response.choices[0]?.message?.content || "{}";
    parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
    await logAIEvent({
      userId: user.id,
      inspectionId: id,
      tool: "priority_repairs",
      prompt: `rank ${list.length} findings`,
      tokensUsed: response.usage?.total_tokens ?? null,
      status: "success",
    });
  } catch (error: any) {
    await logAIEvent({
      userId: user.id,
      inspectionId: id,
      tool: "priority_repairs",
      status: "failed",
      response: { error: error?.message || "ranking failed" },
    });
    return NextResponse.json({ error: "Could not rank the findings. Try again." }, { status: 502 });
  }

  // Build the ordered items from the model, keeping only real finding ids and
  // deduping. Any finding the model dropped is appended in severity order so
  // nothing is ever silently lost from the list.
  const byId = new Map(list.map((f: any) => [String(f.id), f]));
  const seen = new Set<string>();
  const items: { findingId: string; reason: string }[] = [];
  const modelOrder = Array.isArray(parsed?.order) ? parsed.order : [];
  for (const row of modelOrder) {
    const fid = clean(row?.id);
    if (!byId.has(fid) || seen.has(fid)) continue;
    seen.add(fid);
    items.push({ findingId: fid, reason: clean(row?.reason).slice(0, 240) });
  }
  const leftovers = list
    .filter((f: any) => !seen.has(String(f.id)))
    .sort((a: any, b: any) => severityRank(a.severity) - severityRank(b.severity));
  for (const f of leftovers) items.push({ findingId: String(f.id), reason: "" });

  const summary = { generatedAt: new Date().toISOString(), items };
  const { error } = await admin
    .from("inspections")
    .update({ priority_summary: summary })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, summary });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1) return Math.max(0, Math.min(100, number));
  return Math.round(Math.max(0, Math.min(1, number)) * 100);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const inspectionId = cleanText(url.searchParams.get("inspectionId"));
  const section = cleanText(url.searchParams.get("section"));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 30)));

  if (!inspectionId) {
    return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ events: [], persisted: false, reason: "Supabase admin credentials are unavailable." });
  }

  let query = supabase
    .from("inspection_ai_memory_events")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (section) query = query.eq("section", section);

  const { data, error } = await query;

  if (error) {
    // Keep AI tools usable before the optional migration is run.
    return NextResponse.json({
      events: [],
      persisted: false,
      reason: error.message,
    });
  }

  return NextResponse.json({ events: data || [], persisted: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const inspectionId = cleanText(body.inspectionId || body.inspection_id);
  const eventType = cleanText(body.eventType || body.event_type);

  if (!inspectionId || !eventType) {
    return NextResponse.json(
      { error: "inspectionId and eventType are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ saved: false, persisted: false });
  }

  const row = {
    inspection_id: inspectionId,
    section: cleanText(body.section) || null,
    event_type: eventType,
    status: cleanText(body.status) || "active",
    title: cleanText(body.title) || null,
    detail: cleanText(body.detail) || null,
    confidence: normalizeConfidence(body.confidence),
    payload:
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? body.payload
        : {},
  };

  const { data, error } = await supabase
    .from("inspection_ai_memory_events")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    // Do not break live inspection tools when the optional table is not installed.
    return NextResponse.json({
      saved: false,
      persisted: false,
      reason: error.message,
    });
  }

  return NextResponse.json({ saved: true, persisted: true, event: data });
}

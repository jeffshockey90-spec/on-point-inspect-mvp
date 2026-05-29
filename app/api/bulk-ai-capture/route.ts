import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Bulk AI Capture currently processes photos from the client page using the existing /api/ai-photo-finding route and Supabase save workflow.",
  });
}

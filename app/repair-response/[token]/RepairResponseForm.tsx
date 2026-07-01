import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function cleanText(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = cleanText(body?.token);
    const shareId = cleanText(body?.shareId);
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!token || !shareId) {
      return NextResponse.json({ error: "Missing repair request token." }, { status: 400 });
    }

    const { data: share, error: shareError } = await supabase
      .from("repair_request_shares")
      .select("id, token, selected_finding_ids")
      .eq("id", shareId)
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Repair request link is invalid." }, { status: 404 });
    }

    const allowedIds = new Set(
      (Array.isArray(share.selected_finding_ids) ? share.selected_finding_ids : []).map((id: any) => String(id))
    );

    const rows = items
      .map((item: any) => ({
        share_id: share.id,
        finding_id: cleanText(item?.findingId),
        response_status: cleanText(item?.responseStatus) || "pending",
        notes: cleanText(item?.notes),
        updated_at: new Date().toISOString(),
      }))
      .filter((item: any) => item.finding_id && allowedIds.has(item.finding_id));

    if (!rows.length) {
      return NextResponse.json({ error: "No valid repair response items were submitted." }, { status: 400 });
    }

    const { error: upsertError } = await supabase
      .from("repair_request_responses")
      .upsert(rows, { onConflict: "share_id,finding_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    await supabase
      .from("repair_request_shares")
      .update({ status: "completed", responded_at: new Date().toISOString() })
      .eq("id", share.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not submit repair request response." },
      { status: 500 }
    );
  }
}

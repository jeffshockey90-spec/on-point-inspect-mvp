import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function cleanStatus(value: any) {
  const status = String(value || "").trim();

  const allowed = new Set([
    "agree_to_repair",
    "already_repaired",
    "credit_buyer",
    "decline",
    "needs_discussion",
  ]);

  return allowed.has(status) ? status : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token || "").trim();
    const responses = Array.isArray(body?.responses) ? body.responses : [];

    if (!token) {
      return NextResponse.json({ error: "Missing repair request token." }, { status: 400 });
    }

    if (!responses.length) {
      return NextResponse.json({ error: "No repair request responses submitted." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: share, error: shareError } = await supabase
      .from("repair_request_shares")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Repair request link not found." }, { status: 404 });
    }

    const selectedIds = Array.isArray(share.selected_finding_ids)
      ? share.selected_finding_ids.map((id: any) => String(id))
      : [];

    const rows = responses
      .map((item: any) => {
        const findingId = String(item?.findingId || "").trim();
        const responseStatus = cleanStatus(item?.responseStatus);

        if (!findingId || !responseStatus) return null;
        if (selectedIds.length && !selectedIds.includes(findingId)) return null;

        return {
          share_id: share.id,
          finding_id: findingId,
          response_status: responseStatus,
          notes: String(item?.notes || "").trim() || null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (!rows.length) {
      return NextResponse.json(
        { error: "Choose a valid response for each repair request item." },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabase
      .from("repair_request_responses")
      .upsert(rows, {
        onConflict: "share_id,finding_id",
      });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    await supabase
      .from("repair_request_shares")
      .update({
        status: "responded",
        responded_at: new Date().toISOString(),
      })
      .eq("id", share.id);

    try {
      await supabase.from("audit_logs").insert({
        user_id: null,
        action: "repair_request_response_submitted",
        resource_type: "repair_request_share",
        resource_id: String(share.id),
        metadata: {
          inspection_id: share.inspection_id,
          recipient_email: share.recipient_email,
          response_count: rows.length,
        },
      });
    } catch (error) {
      console.error("Repair response audit log failed:", error);
    }

    return NextResponse.json({
      success: true,
      message: "Repair response submitted.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not submit repair response." },
      { status: 500 }
    );
  }
}

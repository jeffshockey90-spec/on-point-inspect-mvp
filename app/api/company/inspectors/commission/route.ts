import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  return createServiceClient(
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

// Save an inspector's commission % (feature #17, Pay Splits). Only the company
// owner may edit, and only members of their own company. Sending null/empty
// clears the override so the company default applies.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.userId || "").trim();
    const rawPct = body.commissionPct;

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing user." }, { status: 400 });
    }

    // null / "" clears the override; otherwise clamp to 0-100.
    let commissionPct: number | null = null;
    if (rawPct !== null && rawPct !== undefined && String(rawPct).trim() !== "") {
      const parsed = Number(rawPct);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: "Commission % must be a number." }, { status: 400 });
      }
      commissionPct = Math.min(100, Math.max(0, parsed));
    }

    const admin = createAdminClient();

    // Caller must be an owner of a company.
    const { data: ownerRows } = await admin
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .not("company_id", "is", null)
      .limit(1);

    const companyId = ownerRows?.[0]?.company_id;

    if (!companyId) {
      return NextResponse.json(
        { error: "Only the company owner can set commission rates." },
        { status: 403 }
      );
    }

    // Target must be on the caller's company.
    const { data: targetMembership } = await admin
      .from("company_users")
      .select("id, company_id")
      .eq("user_id", targetUserId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "That person isn't on your team." }, { status: 404 });
    }

    const { error } = await admin
      .from("company_users")
      .update({ commission_pct: commissionPct })
      .eq("user_id", targetUserId)
      .eq("company_id", companyId);

    if (error) {
      // Best-effort re: the migration — if the column isn't there yet, say so
      // clearly instead of 500-ing with a raw Postgres error.
      const msg = String(error.message || "");
      if (/commission_pct/i.test(msg) && /column/i.test(msg)) {
        return NextResponse.json(
          { error: "Commission column not found. Run supabase/pay-splits.sql, then try again." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, commissionPct });
  } catch (error: any) {
    console.error("Set commission error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not save commission." },
      { status: 500 }
    );
  }
}

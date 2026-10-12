import { NextResponse } from "next/server";
import { logError } from "../../../lib/jarvis/logError";
import { createClient } from "@supabase/supabase-js";
import {
  getSessionUser,
  unauthorized,
  authorizeInspection,
} from "../../../lib/apiAuth";
import { reportSecurityEvent } from "../../../lib/securityAlerts";
import { createInspectionCheckoutSession } from "../../../lib/stripeCheckout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawInspectionId = body?.inspectionId;
    const shareToken = String(body?.shareToken || "").trim();

    if (!shareToken && !rawInspectionId) {
      return NextResponse.json({ error: "Missing inspection reference." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Resolve + authorize before touching payment state. Three legitimate ways in:
    //   (1) the unguessable share token (anonymous token-portal client),
    //   (2) a signed-in inspector / company owner (authorizeInspection), or
    //   (3) a signed-in client CONTACT of the inspection paying their own bill
    //       (e.g. from a legacy numeric portal link).
    // A bare numeric id with no session and no valid token is rejected, so
    // payment state can't be flipped by enumerating sequential ids.
    let inspection: any = null;

    // (1) share token
    if (shareToken) {
      const { data } = await supabase
        .from("inspections")
        .select("*")
        .eq("public_share_token", shareToken)
        .maybeSingle();
      inspection = data || null;
    }

    // (2)/(3) numeric id — from an explicit inspectionId, or a shareToken that is
    // actually a legacy numeric id — gated by a signed-in owner or participant.
    if (!inspection) {
      const numericId =
        rawInspectionId != null && String(rawInspectionId).trim() !== ""
          ? String(rawInspectionId).trim()
          : /^\d+$/.test(shareToken)
          ? shareToken
          : "";

      if (numericId) {
        const user = await getSessionUser();
        if (!user) {
          await reportSecurityEvent({
            req,
            type: "checkout_enum",
            detail: { numericId },
          });
          return unauthorized();
        }

        // owner / company member
        inspection = await authorizeInspection(
          supabase,
          user.id,
          Number(numericId),
          "*"
        );

        // client contact paying their own inspection
        if (!inspection) {
          const { data: candidate } = await supabase
            .from("inspections")
            .select("*")
            .eq("id", numericId)
            .maybeSingle();

          const email = String(user.email || "").trim().toLowerCase();
          if (candidate && email) {
            const { data: contact } = await supabase
              .from("inspection_contacts")
              .select("id")
              .eq("inspection_id", (candidate as any).id)
              .ilike("email", email)
              .limit(1)
              .maybeSingle();
            if (contact) inspection = candidate;
          }
        }
      }
    }

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://app.flowinspect.app";

    // SINGLE PATH: every inspection checkout goes through lib/stripeCheckout.ts
    // (Connect direct charge + online fee + the > 0 stale-balance guard + the
    // reconciliation metadata). This route used to re-implement all of that
    // inline, which is exactly how the fee/account logic drifts and reintroduces
    // the "raw platform account, no fee" bug. Keep the resolution/auth above
    // here; delegate the charge creation to the shared helper.
    const result = await createInspectionCheckoutSession({ supabase, inspection, appUrl });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, details: (result as any).details },
        { status: result.status },
      );
    }

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      balanceDue: result.balanceDue,
      portalProcessingFee: result.portalProcessingFee,
      totalOnlinePayment: result.totalOnlinePayment,
      stripeConnectEnabled: true,
      chargeType: "direct_charge",
    });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    await logError({
      source: "api/create-checkout-session",
      message: String(error?.message || error),
      severity: "critical",
      detail: { stack: error?.stack },
    });

    return NextResponse.json(
      { error: error?.message || "Failed to create checkout session." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendPushNotification } from "../../../../lib/push";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

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

function cleanPreview(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 140);
}

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
    const message = String(body.message || "").trim();

    if (!message) {
      return NextResponse.json({ error: "Please describe your suggestion." }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const { data: companyUser } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const userName = profile?.full_name || profile?.email || user.email || "An inspector";
    const userEmail = profile?.email || user.email || null;

    const { data: created, error } = await admin
      .from("feature_requests")
      .insert({
        user_id: user.id,
        user_name: userName,
        user_email: userEmail,
        company_id: companyUser?.company_id || null,
        message,
        status: "new",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Await so the push actually sends before the serverless function returns.
    const pushResults = await Promise.allSettled(
      OWNER_EMAILS.map((ownerEmail) =>
        sendPushNotification({
          title: "💡 New Suggestion",
          body: `${userName}: ${cleanPreview(message)}`,
          url: "/dashboard/owner/suggestions",
          eventType: "feature_request",
          target: "user",
          targetUserEmail: ownerEmail,
        })
      )
    );
    pushResults.forEach((r) => {
      if (r.status === "rejected") {
        console.error("Feature request owner push failed:", r.reason);
      }
    });

    return NextResponse.json({ ok: true, request: created });
  } catch (error: any) {
    console.error("Feature request submit error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not submit suggestion." },
      { status: 500 }
    );
  }
}

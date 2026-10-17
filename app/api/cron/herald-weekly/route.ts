import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import { addMessage } from "../../../../lib/jarvis/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Herald's proactive loop: once a week, draft a couple of honest Facebook post
// options and drop them in the "Herald · Promo drafts" workspace thread, each
// with an Approve & publish button. Nothing publishes automatically — Jeff
// approves. CRON_SECRET-gated.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const xcs = req.headers.get("x-cron-secret") || "";
  if (secret && auth !== `Bearer ${secret}` && xcs !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { heraldRespond } = await import("../../../../lib/jarvis/agent");

    const history = [
      {
        role: "user",
        content:
          "Draft ONE short, ready-to-publish Facebook post to promote On Point Home Inspections / FLOW this week. Base it on a REAL, true thing — check get_recent_changes for anything that actually shipped; otherwise a genuine seasonal home-maintenance angle is fine. Output ONLY the post text, exactly as it should appear on Facebook — no 'Option 1', no preamble, no notes — because Jeff will review it and tap Approve & publish to post it as-is.",
      },
    ];
    const text = String(await heraldRespond({ admin, today, timeZone: "America/New_York", history })).trim();
    if (!text) return NextResponse.json({ ok: true, posted: false, note: "no draft produced" });

    let jThreadId: string | null = null;
    const { data: existing } = await admin
      .from("jarvis_threads")
      .select("id")
      .eq("title", "Herald · Promo drafts")
      .maybeSingle();
    jThreadId = existing?.id || null;
    if (!jThreadId) {
      const { data: created } = await admin
        .from("jarvis_threads")
        .insert({ title: "Herald · Promo drafts", severity: "info", origin: "jarvis", status: "open" })
        .select("id")
        .maybeSingle();
      jThreadId = created?.id || null;
    }
    if (!jThreadId) return NextResponse.json({ ok: true, posted: false, note: "no workspace thread" });

    await addMessage(admin, { threadId: jThreadId, author: "herald", body: text });

    return NextResponse.json({ ok: true, posted: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "herald-weekly failed." }, { status: 500 });
  }
}

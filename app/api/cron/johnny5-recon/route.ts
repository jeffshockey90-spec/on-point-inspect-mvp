import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import { johnny5Respond } from "../../../../lib/jarvis/agent";
import { addMessage, createThread } from "../../../../lib/jarvis/threads";
import { logError } from "../../../../lib/jarvis/logError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Johnny 5's daily competitor recon. Rotates through the home-inspection SaaS
// field, fetches their public pages, writes a tight brief, and appends it to a
// rolling "Daily Competitor Recon" thread — which pushes Jeff (via addMessage's
// notifyOwner). So Jeff gets a daily recon update in the @team workspace.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

const RECON_TITLE = "Johnny 5 · Daily Competitor Recon";

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const history = [
    {
      role: "user",
      content: `It's ${today}. Run today's competitor recon for FLOW. Pick 1–2 competitors (rotate day to day — Spectora, Hive, HomeGauge, Carson Dunlop Horizon, ISN, Palmtech, Tap Inspect) and web_fetch their public features / pricing / "what's new" pages. Then write a TIGHT daily brief: open with a one-line headline, then what's notable (new features, pricing, positioning), where FLOW is behind or ahead, and 2–3 concrete moves for FLOW (a feature, or an app/layout/UX change) ranked by impact vs effort. If a fetch fails, say so briefly and lean on what you know. Keep it scannable.`,
    },
  ];

  let brief = "";
  try {
    brief = (await johnny5Respond({ admin, today, timeZone: "America/New_York", history })).trim();
  } catch (e: any) {
    await logError({ source: "api/cron/johnny5-recon", message: String(e?.message || e), severity: "warning" });
    brief = `Recon couldn't run today (${e?.message || "unknown"}).`;
  }
  if (!brief) return NextResponse.json({ ok: false, note: "empty brief" });

  // Append to the rolling recon thread, or open it the first time.
  const { data: rows } = await admin
    .from("jarvis_threads")
    .select("id")
    .eq("title", RECON_TITLE)
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .limit(1);

  let threadId: string | null = rows?.[0]?.id || null;
  if (!threadId) {
    const r = await createThread(admin, {
      title: RECON_TITLE,
      severity: "info",
      origin: "jarvis",
      author: "johnny5",
      body: brief,
    });
    threadId = r.id;
  } else {
    await addMessage(admin, { threadId, author: "johnny5", body: brief });
  }

  return NextResponse.json({
    ok: true,
    thread_id: threadId,
    headline: brief.split(/\r?\n/)[0].slice(0, 160),
  });
}

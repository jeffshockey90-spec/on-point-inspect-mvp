import { NextResponse } from "next/server";
import { getAIBudgetStatus, markAIBudgetAlertSent } from "../../../../lib/aiBudget";
import { sendPushNotification } from "../../../../lib/push";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return true;
  }

  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";

  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getAIBudgetStatus();

    if (!status.low || status.lastAlertSentAt) {
      return NextResponse.json({ ok: true, alerted: false, status });
    }

    const remaining = status.remainingUsd.toFixed(2);

    let sent = 0;
    for (const email of OWNER_EMAILS) {
      const result = await sendPushNotification({
        title: "⚠️ AI Budget Running Low",
        body: `Your OpenAI balance is down to $${remaining}, under your $${status.thresholdUsd} threshold. Add more credit soon.`,
        url: "/dashboard/owner",
        eventType: "ai_budget_low",
        target: "user",
        targetUserEmail: email,
      });
      sent += result.sent;
    }

    await markAIBudgetAlertSent();

    return NextResponse.json({ ok: true, alerted: true, sent, status });
  } catch (error: any) {
    console.error("AI budget cron check error:", error);
    return NextResponse.json(
      { error: error?.message || "AI budget check failed." },
      { status: 500 }
    );
  }
}

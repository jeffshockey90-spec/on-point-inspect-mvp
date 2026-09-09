import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { openai, getAIModel } from "../../../../lib/openai";
import { runJarvisTool, FLOW_SYSTEM_OVERVIEW, type JarvisContext } from "../../../../lib/jarvis/agent";
import { sendPushNotification } from "../../../../lib/push";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

// Jarvis' nightly sweep: gather the health signals, write the digest in Jarvis'
// voice, store it for the owner feed, and push the owner if anything is urgent.
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const today = new Date().toISOString().slice(0, 10);
  const ctx: JarvisContext = { admin, today, timeZone: "America/New_York" };

  // Gather every signal in parallel.
  const [errors, security, email, payments, activity, changes, budget] = await Promise.all([
    runJarvisTool("get_recent_errors", { hours: 24 }, ctx),
    runJarvisTool("get_security_events", { hours: 24 }, ctx),
    runJarvisTool("get_email_health", { hours: 168 }, ctx),
    runJarvisTool("get_payment_webhook_health", {}, ctx),
    runJarvisTool("get_activity_snapshot", { days: 7 }, ctx),
    runJarvisTool("get_recent_changes", { limit: 8 }, ctx),
    runJarvisTool("get_ai_budget", {}, ctx),
  ]);

  const signals = { errors, security, email, payments, activity, changes, budget };

  // Compute urgency deterministically (don't rely on the model for this).
  const criticalErrors = Number((errors as any)?.by_severity?.critical || 0);
  const emailProblems = Number((email as any)?.bounced || 0) + Number((email as any)?.failed || 0);
  const budgetLow = Boolean((budget as any)?.low);
  const securityBurst = Number((security as any)?.total_events || 0) >= 25;
  const activityAnomalyDays = Number((activity as any)?.days_since_last_inspection || 0);
  const webhookQuiet = (payments as any)?.events_receiving_recently === false;

  const urgent = criticalErrors > 0 || budgetLow || securityBurst || activityAnomalyDays >= 7;
  const severity: "info" | "warning" | "critical" = urgent
    ? "critical"
    : emailProblems > 0 || (errors as any)?.distinct_errors > 0 || webhookQuiet || activityAnomalyDays >= 3
      ? "warning"
      : "info";

  // Have Jarvis write the digest in his voice from the signals.
  let body = "";
  let headline = "";
  try {
    const completion = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content: `You are Jarvis, Jeff's private AI operations partner for FLOW. Write his health digest in your own voice: calm, sharp, human, first person, a little dry wit — like a trusted chief of staff, never a status page. Ground everything in the SIGNALS given; invent nothing. If it's a quiet day, say so plainly and briefly — don't manufacture concern. Structure: open with ONE punchy headline line, then a short read of what matters (failures, security, deliverability, payments, activity), then — only if warranted — a crisp "worth improving" and/or "an idea" note. Keep it tight. Markdown, no preamble like "Here is".\n\nWhat you know about FLOW:\n${FLOW_SYSTEM_OVERVIEW}`,
        },
        { role: "user", content: `Today is ${today}. Here are today's signals as JSON:\n\n${JSON.stringify(signals).slice(0, 14000)}` },
      ],
      temperature: 0.5,
      max_completion_tokens: 900,
    });
    body = completion.choices[0]?.message?.content?.trim() || "";
    headline = body.split(/\r?\n/)[0].replace(/^#+\s*/, "").slice(0, 200);
  } catch (e: any) {
    body = `I couldn't compose the digest (AI call failed: ${e?.message || "unknown"}). Raw signals are stored.`;
    headline = "Digest generation failed";
  }

  const { data: stored } = await admin
    .from("jarvis_reports")
    .insert({ kind: "digest", headline, body, severity, signals })
    .select("id")
    .maybeSingle();

  // Push the owner on anything urgent.
  let pushed = false;
  if (urgent) {
    for (const email of OWNER_EMAILS) {
      try {
        await sendPushNotification({
          title: "🤖 Jarvis: needs your eyes",
          body: headline.slice(0, 140),
          url: "/dashboard/owner/jarvis",
          eventType: "jarvis_alert",
          target: "user",
          targetUserEmail: email,
          ownerEmail: email,
        });
        pushed = true;
      } catch {
        /* best-effort */
      }
    }
  }

  return NextResponse.json({ ok: true, id: stored?.id || null, severity, urgent, pushed, headline });
}

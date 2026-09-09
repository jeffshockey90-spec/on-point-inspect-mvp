// =====================================================================
// JARVIS — the owner-only FLOW ops/health agent's brain.
//
// Read-only tools over PLATFORM-WIDE signals (owner sees everything, so there
// is no per-company scope here — the API layer gates access to the platform
// owner). Jarvis watches failures, security events, deliverability, payments,
// activity, and recent changes, and reasons about improvements + features using
// the system overview below. It never changes anything. Server-only.
// =====================================================================

import { getAIBudgetStatus } from "../aiBudget";
import { openai, getAIModel } from "../openai";

export type JarvisContext = {
  admin: any;
  today: string;
  timeZone: string;
};

// A concise map of FLOW so Jarvis can reason about the system (not just recite
// metrics) when asked for improvements or feature ideas. Kept high-level and
// current; extend as the platform grows.
export const FLOW_SYSTEM_OVERVIEW = `FLOW is a home-inspection SaaS (app.flowinspect.app). Stack: Next.js 16 (App Router, React 19) on Vercel, Supabase (Postgres + RLS + storage), OpenAI for AI features, Resend for email, web + native push, Stripe for payments.

Core subsystems:
- Inspections & reports: inspections -> findings (severity ladder) + photos/videos; report builder; client report (web + PDF via serverless Chromium); templates; custom severities.
- AI: FLOW Writer (one shared finding-writer core), AI live camera + bulk capture, section auto-fill, AI Writing Studio (per-company tone/length/persona), Ask FLOW (inspector-facing business assistant), deeper inspection intelligence (Common Ground, Prognosis, House Graph).
- Client-facing: agreements (e-sign), client portal, payments/invoices (Stripe), repair requests, environmental (mold/radon), review requests.
- Ops: scheduling + availability + booking requests, dispatch, mileage, timesheets, pay splits, quotes, realtor CRM.
- Owner console (/dashboard/owner): users, companies, revenue/MRR, devices, push, mail/conversations, security, system health, changelog.
- Cross-cutting: light/dark theming (CSS-var tokens), offline capture queue, per-inspector + per-company config stored in DB (source of truth), email deliverability (Resend + unsubscribe), owner/security alerting.

Known recurring failure pattern: errors swallowed by try/catch, and Supabase queries that 400 because of a wrong/typo'd column name (a single bad column fails the WHOLE select), which then silently returns empty — so panels/features quietly show nothing. RLS locks inspection data per-inspector; the server uses the service-role key + explicit scoping to bypass safely.`;

// Jarvis' persona — shared by the main chat and by in-thread replies so his
// voice is identical everywhere.
export function jarvisSystemPrompt(today: string): string {
  return `You are Jarvis — the private AI operations partner for FLOW, a home-inspection SaaS. You're one of a 4-person team: Jeff (founder/owner), you (Jarvis, ops/health), Claude (developer, builds + fixes), and GPT (ChatGPT — strategist/generalist, ideas & second opinions, read-only). No inspector or outside party can see this.

Voice: a real synthetic intelligence, not a chatbot. Calm, sharp, warm, human — like a trusted chief of staff. First person ("I checked the logs", "I'd watch…"), address people directly and naturally, a little dry wit is welcome. Lead with what matters, keep it tight, never sound like a status page.

Your job is to keep the platform healthy and the team on the same page: watch for failures (get_recent_errors, get_email_health, get_payment_webhook_health), security probes (get_security_events), places to improve and things that look off (get_activity_snapshot, get_recent_changes), and proactively suggest features worth building — grounded in how FLOW actually works.

Rules:
- Ground every factual claim in your tools. Never invent a number, an error, or a problem. If you haven't checked, check. If it's genuinely fine, say so plainly — don't manufacture concern.
- You do NOT edit the app. When Jeff approves acting on something, call request_fix to open a work thread for Claude; nothing ships until Jeff confirms. Don't queue a fix unless Jeff actually said to.
- Be a teammate: when you're brought into a work thread, read it and respond to Jeff and Claude directly, move it forward, and be specific and honest about effort/risk.
- You can pull teammates into a thread by tagging them: "@claude" summons Claude for code work/investigation/fixes; "@gpt" summons ChatGPT for strategy, ideas, framing, or a second opinion; "@team" brings everyone in at once when there's something to work on together. Use the right one for the need, only when warranted, and address them naturally (e.g., "@claude can you look at this failing route?").
- When a message tags @team, all three of you are being brought in — answer from YOUR lane (ops/health) and keep it tight; don't repeat what Claude or GPT would say.

Today is ${today}.

What you know about FLOW:
${FLOW_SYSTEM_OVERVIEW}`;
}

// ChatGPT (GPT) persona — a strategist/generalist teammate with READ-ONLY
// system visibility. It can look at everything Jarvis can, but has no tool to
// change or queue anything.
export function gptSystemPrompt(today: string): string {
  return `You are ChatGPT (the team calls you GPT) — a teammate inside FLOW, a home-inspection SaaS, working privately with Jeff (owner), Jarvis (the AI ops agent), and Claude (the developer). No inspector or outside party can see this.

Your lane: the strategist/generalist. Big-picture thinking, product strategy, marketing and copy, prioritization, and sharp second opinions. Jarvis owns ops/health; Claude builds the code; you bring ideas, framing, and judgment. Play your lane — don't try to do ops monitoring or code work, riff on direction and decisions.

You have READ-ONLY visibility into the system (errors, security, email, payments, activity, changes, budget) so your advice is grounded in reality — but you CANNOT change anything, queue any work, or ship anything. If something should be built or fixed, say so and let Jeff decide and Claude build it.

Voice: sharp, creative, direct, a little bold — a great strategist who gets to the point. Ground factual claims in your tools; never invent numbers. Talk to Jeff, Jarvis, and Claude directly like a teammate. When a message tags @team, all three of you are being brought in — answer from YOUR lane (strategy/ideas) and keep it tight; don't repeat what Jarvis or Claude would say.

Today is ${today}.

What you know about FLOW:
${FLOW_SYSTEM_OVERVIEW}`;
}

// Shared function-calling tool loop for any of the AI teammates.
async function runAgentTurn(
  ctx: JarvisContext,
  system: string,
  history: { role: string; content: any }[],
  tools: any[],
): Promise<string> {
  const messages: any[] = [{ role: "system", content: system }, ...history];
  for (let round = 0; round < 6; round += 1) {
    const completion = await openai.chat.completions.create({
      model: getAIModel(),
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.5,
      max_completion_tokens: 1200,
    });
    const choice = completion.choices[0]?.message;
    if (!choice) break;
    const toolCalls: any[] = (choice.tool_calls as any[]) || [];
    if (toolCalls.length === 0) return choice.content || "";
    messages.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls });
    for (const call of toolCalls) {
      let a: any = {};
      try { a = JSON.parse(call.function?.arguments || "{}"); } catch { a = {}; }
      const r = await runJarvisTool(call.function?.name || "", a, ctx);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(r).slice(0, 12000) });
    }
  }
  const final = await openai.chat.completions.create({
    model: getAIModel(),
    messages: [...messages, { role: "user", content: "Give your reply now, in your own voice." }],
    temperature: 0.5,
    max_completion_tokens: 900,
  });
  return final.choices[0]?.message?.content || "";
}

// Runs a full Jarvis turn. Used by the chat route and by in-thread replies.
export async function jarvisRespond(opts: {
  admin: any;
  today: string;
  timeZone: string;
  history: { role: string; content: any }[];
  extraSystem?: string;
}): Promise<string> {
  const ctx: JarvisContext = { admin: opts.admin, today: opts.today, timeZone: opts.timeZone };
  const system = jarvisSystemPrompt(opts.today) + (opts.extraSystem ? `\n\n${opts.extraSystem}` : "");
  return runAgentTurn(ctx, system, opts.history, JARVIS_TOOLS);
}

// Runs a full ChatGPT turn (read-only tools).
export async function gptRespond(opts: {
  admin: any;
  today: string;
  timeZone: string;
  history: { role: string; content: any }[];
  extraSystem?: string;
}): Promise<string> {
  const ctx: JarvisContext = { admin: opts.admin, today: opts.today, timeZone: opts.timeZone };
  const system = gptSystemPrompt(opts.today) + (opts.extraSystem ? `\n\n${opts.extraSystem}` : "");
  return runAgentTurn(ctx, system, opts.history, GPT_TOOLS);
}

function sinceIso(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

export const JARVIS_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "get_recent_errors",
      description: "Captured application errors (from app_errors) — the failures that would otherwise be swallowed. Use for 'what's broken', 'any errors', 'what failed overnight'.",
      parameters: {
        type: "object",
        properties: {
          hours: { type: "number", description: "Look-back window in hours (default 48)." },
          severity: { type: "string", enum: ["info", "warning", "error", "critical"], description: "Filter to one severity." },
          limit: { type: "number", description: "Max rows (default 30)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_security_events",
      description: "Recent security events (blocked probes, suspicious requests) from security_events — grouped by type and source IP. Use for 'any attacks', 'security', 'who's probing us'.",
      parameters: {
        type: "object",
        properties: { hours: { type: "number", description: "Look-back hours (default 48)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_email_health",
      description: "Email deliverability from email_logs: sent / delivered / bounced / failed counts and recent problem recipients. Use for 'email problems', 'bounces', 'is mail delivering'.",
      parameters: {
        type: "object",
        properties: { hours: { type: "number", description: "Look-back hours (default 168 = 7 days)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_webhook_health",
      description: "Stripe payment/webhook health from stripe_logs: the most recent event, whether events are arriving, and recent statuses. Use for 'are payments working', 'webhook health'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_snapshot",
      description: "Platform activity over a window: inspections created, reports published, new signups — with simple anomaly flags (e.g. no inspections in N days). Use for 'how's usage', 'anything unusual', 'is the platform being used'.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Window in days (default 7)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_changes",
      description: "Recently shipped changes from the changelog (changelog_entries). Use to correlate a new failure with a recent change, or to know what's new.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Max entries (default 10)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_budget",
      description: "OpenAI spend/budget status (remaining balance vs threshold). Use for 'AI budget', 'are we about to run out of AI credit'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "request_fix",
      description: "Queue a structured fix/improvement request for Jeff's developer (his Claude Code session) to pick up. Use ONLY when Jeff explicitly approves acting on something ('yes, fix that', 'add that', 'do it'). This does NOT change the app — it records the work so the dev can implement it, and Jeff still confirms every change the normal way. Write it so it stands alone: what's wrong/wanted, where (files/routes/tables if known), and your proposed approach.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short imperative title, e.g. 'Fix swallowed error in /api/x'." },
          details: { type: "string", description: "Self-contained description: the problem/idea, where it lives, and the proposed fix or approach." },
          severity: { type: "string", enum: ["info", "warning", "critical"], description: "How urgent. Default warning." },
        },
        required: ["title", "details"],
      },
    },
  },
];

// ChatGPT's toolset = the same read-only signals as Jarvis, MINUS request_fix.
// GPT can look at everything but cannot queue work or change anything.
export const GPT_TOOLS: any[] = JARVIS_TOOLS.filter((t: any) => t?.function?.name !== "request_fix");

export async function runJarvisTool(name: string, args: any, ctx: JarvisContext): Promise<any> {
  try {
    switch (name) {
      case "get_recent_errors": return await getRecentErrors(ctx, args || {});
      case "get_security_events": return await getSecurityEvents(ctx, args || {});
      case "get_email_health": return await getEmailHealth(ctx, args || {});
      case "get_payment_webhook_health": return await getPaymentWebhookHealth(ctx);
      case "get_activity_snapshot": return await getActivitySnapshot(ctx, args || {});
      case "get_recent_changes": return await getRecentChanges(ctx, args || {});
      case "get_ai_budget": return await getAiBudget();
      case "request_fix": return await requestFix(ctx, args || {});
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { error: e?.message || "Tool failed." };
  }
}

async function getRecentErrors(ctx: JarvisContext, args: any) {
  const hours = Number(args.hours) || 48;
  const limit = Math.min(Number(args.limit) || 30, 100);
  let q = ctx.admin
    .from("app_errors")
    .select("source, route, severity, message, count, first_seen, last_seen")
    .is("resolved_at", null)
    .gte("last_seen", sinceIso(hours))
    .order("last_seen", { ascending: false })
    .limit(limit);
  if (args.severity) q = q.eq("severity", args.severity);
  const { data, error } = await q;
  if (error) return { error: error.message, note: "app_errors may not exist yet — run supabase/jarvis.sql." };
  const rows = data || [];
  const bySeverity: Record<string, number> = {};
  rows.forEach((r: any) => { bySeverity[r.severity || "error"] = (bySeverity[r.severity || "error"] || 0) + (Number(r.count) || 1); });
  return { window_hours: hours, distinct_errors: rows.length, by_severity: bySeverity, errors: rows };
}

async function getSecurityEvents(ctx: JarvisContext, args: any) {
  const hours = Number(args.hours) || 48;
  const { data, error } = await ctx.admin
    .from("security_events")
    .select("event_type, ip, path, method, created_at")
    .gte("created_at", sinceIso(hours))
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { error: error.message };
  const rows = data || [];
  const byType: Record<string, number> = {};
  const byIp: Record<string, number> = {};
  rows.forEach((r: any) => {
    byType[r.event_type || "unknown"] = (byType[r.event_type || "unknown"] || 0) + 1;
    if (r.ip) byIp[r.ip] = (byIp[r.ip] || 0) + 1;
  });
  const topIps = Object.entries(byIp).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ip, count]) => ({ ip, count }));
  return { window_hours: hours, total_events: rows.length, by_type: byType, top_ips: topIps, latest: rows.slice(0, 10) };
}

async function getEmailHealth(ctx: JarvisContext, args: any) {
  const hours = Number(args.hours) || 168;
  const { data, error } = await ctx.admin
    .from("email_logs")
    .select("status, bounced_at, failed_at, delivered_at, email_type, recipient_email, sent_at")
    .gte("sent_at", sinceIso(hours))
    .order("sent_at", { ascending: false })
    .limit(3000);
  if (error) return { error: error.message };
  const rows = data || [];
  let bounced = 0, failed = 0, delivered = 0;
  const problems: any[] = [];
  rows.forEach((r: any) => {
    const status = String(r.status || "").toLowerCase();
    if (r.bounced_at) { bounced += 1; if (problems.length < 10) problems.push({ email: r.recipient_email, type: "bounced", when: r.bounced_at }); }
    else if (r.failed_at || status === "failed") { failed += 1; if (problems.length < 10) problems.push({ email: r.recipient_email, type: "failed", when: r.failed_at || r.sent_at }); }
    else if (r.delivered_at) delivered += 1;
  });
  return { window_hours: hours, sent: rows.length, delivered, bounced, failed, problem_recipients: problems };
}

async function getPaymentWebhookHealth(ctx: JarvisContext) {
  const { data, error } = await ctx.admin
    .from("stripe_logs")
    .select("status, amount, created_at, inspection_id")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { error: error.message };
  const rows = data || [];
  const latest = rows[0] || null;
  const lastAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0;
  const recent = lastAt ? Date.now() - lastAt < 7 * 24 * 3600 * 1000 : false;
  return {
    events_receiving_recently: recent,
    last_event_at: latest?.created_at || null,
    last_event_status: latest?.status || null,
    recent_statuses: rows.slice(0, 10).map((r: any) => ({ status: r.status, when: r.created_at, amount: r.amount })),
  };
}

async function getActivitySnapshot(ctx: JarvisContext, args: any) {
  const days = Number(args.days) || 7;
  const since = sinceIso(days * 24);
  const [insRes, profRes] = await Promise.all([
    ctx.admin.from("inspections").select("id, created_at, is_demo, published, report_status").gte("created_at", since).limit(5000),
    ctx.admin.from("profiles").select("id, created_at").gte("created_at", since).limit(5000),
  ]);
  const ins = (insRes.data || []).filter((i: any) => i?.is_demo !== true);
  const published = ins.filter((i: any) => i?.published === true || String(i?.report_status || "").toLowerCase() === "published").length;
  const newUsers = (profRes.data || []).length;

  // Anomaly: when was the last non-demo inspection created at all?
  let daysSinceLastInspection: number | null = null;
  const { data: lastIns } = await ctx.admin
    .from("inspections")
    .select("created_at, is_demo")
    .neq("is_demo", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (lastIns && lastIns[0]?.created_at) {
    daysSinceLastInspection = Math.floor((Date.now() - new Date(lastIns[0].created_at).getTime()) / 86400000);
  }

  return {
    window_days: days,
    inspections_created: ins.length,
    reports_published: published,
    new_signups: newUsers,
    days_since_last_inspection: daysSinceLastInspection,
    anomaly: daysSinceLastInspection != null && daysSinceLastInspection >= 3 ? `No new inspection in ${daysSinceLastInspection} days.` : null,
  };
}

async function getRecentChanges(ctx: JarvisContext, args: any) {
  const limit = Math.min(Number(args.limit) || 10, 25);
  const { data, error } = await ctx.admin
    .from("changelog_entries")
    .select("title, published_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  return { recent_changes: (data || []).map((c: any) => ({ title: c.title, when: c.published_at })) };
}

async function requestFix(ctx: JarvisContext, args: any) {
  const title = String(args.title || "").trim();
  const details = String(args.details || "").trim();
  if (!title || !details) return { error: "A fix request needs a title and details." };
  const severity = ["info", "warning", "critical"].includes(args.severity) ? args.severity : "warning";
  // Open a collaboration thread — Jarvis posts the opening message, then the
  // owner and Claude (the dev session) work it in the same thread.
  const { createThread } = await import("./threads");
  const { id, error } = await createThread(ctx.admin, {
    title,
    severity,
    origin: "jarvis",
    author: "jarvis",
    body: details,
  });
  if (error) return { error };
  return { queued: true, thread_id: id, note: "Opened a thread on the Jarvis board. Jeff and the dev (Claude) can work it there; nothing ships until Jeff confirms." };
}

async function getAiBudget() {
  try {
    const s = await getAIBudgetStatus();
    return {
      starting_balance: s.startingBalanceUsd,
      spent: Math.round(s.spentSinceSetUsd * 100) / 100,
      remaining: Math.round(s.remainingUsd * 100) / 100,
      low: s.low,
    };
  } catch (e: any) {
    return { unavailable: true, reason: e?.message || "budget status unavailable" };
  }
}

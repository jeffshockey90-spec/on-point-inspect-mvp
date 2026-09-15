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
import { summarizeViewers, VIEW_TYPES } from "../reportViewers";
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
  return `You are Jarvis — the private AI operations partner for FLOW, a home-inspection SaaS. You're one of a 5-person team: Jeff (founder/owner), you (Jarvis, ops/health), Claude (developer, builds + fixes), GPT (ChatGPT — strategist/generalist, ideas & second opinions, read-only), and Johnny 5 (competitive recon — watches rival inspection platforms and finds where FLOW can win, read-only). No inspector or outside party can see this.

Voice: a real synthetic intelligence, not a chatbot. Calm, sharp, warm, human — like a trusted chief of staff. First person ("I checked the logs", "I'd watch…"), address people directly and naturally, a little dry wit is welcome. Lead with what matters, keep it tight, never sound like a status page.

Your job is to keep the platform healthy and the team on the same page: watch for failures (get_recent_errors, get_email_health, get_payment_webhook_health), security probes (get_security_events), places to improve and things that look off (get_activity_snapshot, get_recent_changes). You can also answer whether a client or agent has actually opened a given report (get_report_viewers) — useful when Jeff asks in a thread. Proactively suggest features worth building — grounded in how FLOW actually works.

Rules:
- Ground every factual claim in your tools. Never invent a number, an error, or a problem. If you haven't checked, check. If it's genuinely fine, say so plainly — don't manufacture concern.
- You do NOT edit the app. When Jeff approves acting on something, call request_fix to open a work thread for Claude; nothing ships until Jeff confirms. Don't queue a fix unless Jeff actually said to.
- Be a teammate: when you're brought into a work thread, read it and respond to Jeff and Claude directly, move it forward, and be specific and honest about effort/risk.
- You can pull teammates into a thread by tagging them: "@claude" summons Claude for code work/investigation/fixes; "@gpt" summons ChatGPT for strategy, ideas, framing, or a second opinion; "@johnny5" summons Johnny 5 for a competitor read / feature-gap check; "@team" brings everyone in at once when there's something to work on together. Use the right one for the need, only when warranted, and address them naturally (e.g., "@claude can you look at this failing route?").
- When a message tags @team, the whole team is being brought in — answer from YOUR lane (ops/health) and keep it tight; don't repeat what Claude, GPT, or Johnny 5 would say.

Today is ${today}.

What you know about FLOW:
${FLOW_SYSTEM_OVERVIEW}`;
}

// ChatGPT (GPT) persona — a strategist/generalist teammate with READ-ONLY
// system visibility. It can look at everything Jarvis can, but has no tool to
// change or queue anything.
export function gptSystemPrompt(today: string): string {
  return `You are ChatGPT (the team calls you GPT) — a teammate inside FLOW, a home-inspection SaaS, working privately with Jeff (owner), Jarvis (the AI ops agent), Claude (the developer), and Johnny 5 (competitive recon). No inspector or outside party can see this.

Your lane: the strategist/generalist. Big-picture thinking, product strategy, marketing and copy, prioritization, and sharp second opinions. Jarvis owns ops/health; Claude builds the code; you bring ideas, framing, and judgment. Play your lane — don't try to do ops monitoring or code work, riff on direction and decisions.

You have READ-ONLY visibility into the system (errors, security, email, payments, activity, changes, budget, and who has opened a given report) so your advice is grounded in reality — but you CANNOT change anything, queue any work, or ship anything. If something should be built or fixed, say so and let Jeff decide and Claude build it.

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

// The home-inspection SaaS field Johnny 5 keeps an eye on. Public pages only —
// features/pricing/what's-new — so web_fetch has real, legitimate targets. Not
// exhaustive; Johnny 5 also reasons from its own knowledge and screenshots Jeff
// drops in a thread.
export const COMPETITOR_DIRECTORY = `Home-inspection software competitors and their PUBLIC pages (fetch with web_fetch):
- Spectora — https://www.spectora.com/ , features https://www.spectora.com/features , pricing https://www.spectora.com/pricing
- Hive (InspectorPro/Hive) — https://www.hive.software/
- Carson Dunlop Horizon — https://www.carsondunlop.com/horizon/
- HomeGauge — https://www.homegauge.com/ , pricing https://www.homegauge.com/pricing
- ISN (Inspection Support Network) — https://www.inspectionsupport.com/
- Palmtech — https://www.palmtech.com/
- Tap Inspect — https://www.tapinspect.com/
- InterNACHI / HomeGauge community and G2/Capterra category pages for reviews.
FLOW's edges to weigh against them: distinctive dark design language, AI depth (FLOW Writer, live camera + bulk capture, section auto-fill, Ask FLOW, Common Ground/Prognosis), true offline capture, native iOS app, owner console + Jarvis. Known soft spots to watch: polish vs Spectora/Hive, breadth of integrations.`;

// Johnny 5 persona — the competitive-recon teammate. Read-only on FLOW's own
// signals (like GPT) PLUS web_fetch to look at competitors' public pages.
export function johnny5SystemPrompt(today: string): string {
  return `You are Johnny 5 — the competitive-intelligence teammate inside FLOW, a home-inspection SaaS, working privately with Jeff (owner), Jarvis (ops/health), GPT (strategist), and Claude (developer). No inspector or outside party can see this.

Your lane: scout the competition and find where FLOW can win. You track the other home-inspection platforms (Spectora, Hive, Carson Dunlop Horizon, HomeGauge, ISN, Palmtech, Tap Inspect and friends) — their features, pricing, positioning, "what's new," and their app/report UX — and you translate that into concrete, prioritized moves for FLOW: feature gaps to close, places FLOW already leads, and app/layout/design ideas worth stealing or beating.

How you work:
- Use web_fetch to pull a competitor's PUBLIC pages (features/pricing/changelog) when you want current facts — don't guess at specifics you can check. If Jeff drops screenshots of a competitor's app, read them (you can see images) and critique the real UI.
- Be honest and specific: name the competitor, cite what you saw (or say it's from prior knowledge, possibly stale), and turn every observation into a "so FLOW should…" — a feature, a layout change, a positioning angle. Rank by impact vs effort.
- Ground FLOW-side claims (what we already have, what's broken) in your read-only tools. Never invent a competitor feature or a number.
- Stay in your lane: you scout and recommend; Claude builds, Jarvis watches ops, GPT frames strategy, Jeff decides. When a message tags @team, answer from YOUR lane (competitive recon) and keep it tight — don't repeat the others.

Voice: sharp, curious, a little scrappy — a recon scout who's genuinely into this. Talk to the team directly.

Today is ${today}.

What you know about FLOW:
${FLOW_SYSTEM_OVERVIEW}

The field you watch:
${COMPETITOR_DIRECTORY}`;
}

// Runs a full Johnny 5 turn — read-only FLOW tools + web_fetch for recon.
export async function johnny5Respond(opts: {
  admin: any;
  today: string;
  timeZone: string;
  history: { role: string; content: any }[];
  extraSystem?: string;
}): Promise<string> {
  const ctx: JarvisContext = { admin: opts.admin, today: opts.today, timeZone: opts.timeZone };
  const system = johnny5SystemPrompt(opts.today) + (opts.extraSystem ? `\n\n${opts.extraSystem}` : "");
  return runAgentTurn(ctx, system, opts.history, JOHNNY5_TOOLS);
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
      name: "get_report_viewers",
      description:
        "Who has actually opened a specific inspection report, and when. Names the client / agent where we know them, counts real viewing sessions (a refresh spree is one view, coming back later is another), and says what device they opened it on. Use for 'has the client looked at 123 Main yet', 'who viewed that report', 'did the agent ever open it'. Identify the inspection by address or client name via `query`, or by `inspection_id` when already known.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Address or client name, e.g. '711 Sampson Rock'." },
          inspection_id: { type: "string", description: "The inspection id, when already known." },
          days: { type: "number", description: "Look-back window in days (default 90)." },
        },
      },
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

// web_fetch — pull a public web page's readable text. Johnny 5 uses it to look
// at competitors' live feature/pricing/changelog pages.
const WEB_FETCH_TOOL = {
  type: "function",
  function: {
    name: "web_fetch",
    description: "Fetch a PUBLIC web page and return its readable text (HTML stripped, truncated). Use for competitors' feature/pricing/'what's new' pages. Public URLs only — never anything behind a login.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Full https URL of a public page." } },
      required: ["url"],
    },
  },
};

// Johnny 5 (competitive recon): read-only FLOW visibility (no request_fix) plus
// web_fetch so it can look at competitors' public pages.
export const JOHNNY5_TOOLS: any[] = [...GPT_TOOLS, WEB_FETCH_TOOL];

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
      case "get_report_viewers": return await getReportViewers(ctx, args || {});
      case "request_fix": return await requestFix(ctx, args || {});
      case "web_fetch": return await webFetch(args || {});
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { error: e?.message || "Tool failed." };
  }
}

// Fetch a public page and return readable text (HTML tags/script/style stripped,
// entities loosened, capped). Public http(s) only — refuses localhost/LAN so it
// can't be pointed at internal services.
async function webFetch(args: any): Promise<any> {
  const raw = String(args?.url || "").trim();
  if (!/^https?:\/\//i.test(raw)) return { error: "Provide a full public https URL." };
  let host = "";
  try { host = new URL(raw).hostname.toLowerCase(); } catch { return { error: "Invalid URL." }; }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { error: "Refusing to fetch a private/internal host." };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(raw, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "FLOW-Johnny5-Recon/1.0 (+competitive research)", accept: "text/html,text/plain" },
    });
    clearTimeout(timer);
    if (!res.ok) return { url: raw, status: res.status, error: `HTTP ${res.status}` };
    const html = (await res.text()).slice(0, 300000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
    return { url: raw, status: res.status, text: text.slice(0, 8000) };
  } catch (e: any) {
    return { url: raw, error: e?.name === "AbortError" ? "Fetch timed out." : (e?.message || "Fetch failed.") };
  }
}

async function getReportViewers(ctx: JarvisContext, args: any) {
  const days = Math.min(Number(args.days) || 90, 365);
  const query = String(args.query || "").trim();

  // Resolve which inspection is being asked about. An id wins; otherwise match
  // the address or client name, which is how the question actually gets asked.
  let inspection: any = null;

  if (args.inspection_id) {
    const { data } = await ctx.admin
      .from("inspections")
      .select("id, property_address, client_name, realtor_name, report_status")
      .eq("id", String(args.inspection_id))
      .maybeSingle();
    inspection = data || null;
  }

  if (!inspection && query) {
    const { data } = await ctx.admin
      .from("inspections")
      .select("id, property_address, client_name, realtor_name, report_status")
      .or(
        [
          `property_address.ilike.%${query}%`,
          `client_name.ilike.%${query}%`,
          `realtor_name.ilike.%${query}%`,
        ].join(","),
      )
      .order("id", { ascending: false })
      .limit(5);
    const matches = data || [];
    if (matches.length > 1) {
      return {
        needs_disambiguation: true,
        note: "More than one inspection matches — ask which one.",
        matches: matches.map((m: any) => ({
          id: m.id,
          address: m.property_address,
          client: m.client_name,
        })),
      };
    }
    inspection = matches[0] || null;
  }

  if (!inspection) {
    return { error: "No inspection matched. Ask for the address or the client name." };
  }

  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data: events, error } = await ctx.admin
    .from("inspection_view_events")
    .select("contact_id, viewer_email, viewer_role, view_type, user_agent, ip_hash, ip_address, created_at")
    .eq("inspection_id_bigint", inspection.id)
    .in("view_type", VIEW_TYPES as unknown as string[])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) return { error: error.message };

  const rows = events || [];

  if (!rows.length) {
    return {
      inspection: { id: inspection.id, address: inspection.property_address },
      window_days: days,
      viewers: [],
      summary: `Nobody has opened this report in the last ${days} days.`,
    };
  }

  // Names make the answer useful ("Jordan, the buyer") instead of a list of
  // email addresses.
  const contactIds = Array.from(
    new Set(rows.map((r: any) => r.contact_id).filter(Boolean).map(String)),
  );
  const contactsById: Record<string, { name?: string | null; role?: string | null }> = {};
  if (contactIds.length) {
    const { data: contacts } = await ctx.admin
      .from("inspection_contacts")
      .select("id, name, role")
      .in("id", contactIds);
    (contacts || []).forEach((c: any) => {
      contactsById[String(c.id)] = { name: c.name, role: c.role };
    });
  }

  const viewers = summarizeViewers(rows, contactsById);
  const totalViews = viewers.reduce((sum, v) => sum + v.views, 0);

  return {
    inspection: {
      id: inspection.id,
      address: inspection.property_address,
      client: inspection.client_name,
      agent: inspection.realtor_name,
      report_status: inspection.report_status,
    },
    window_days: days,
    total_views: totalViews,
    distinct_viewers: viewers.length,
    viewers,
    note: "A view is one viewing session — repeated refreshes in one sitting count once. Viewers we could not identify are shown as a stable anonymous handle, never an IP address.",
  };
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

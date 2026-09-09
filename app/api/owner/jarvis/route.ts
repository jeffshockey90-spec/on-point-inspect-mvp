import { NextResponse } from "next/server";
import { openai, getAIModel } from "../../../../lib/openai";
import { createClient } from "../../../../utils/supabase/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { JARVIS_TOOLS, runJarvisTool, FLOW_SYSTEM_OVERVIEW, type JarvisContext } from "../../../../lib/jarvis/agent";
import { DEFAULT_TIME_ZONE } from "../../../../lib/app-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 6;

function jarvisSystemPrompt(today: string) {
  return `You are Jarvis — the private AI operations partner for FLOW, a home-inspection SaaS. You are speaking one-on-one with Jeff, the founder and owner. No one else can see this conversation.

Voice — this matters: you are a real synthetic intelligence, not a chatbot. Speak like a calm, sharp, trusted chief of staff who happens to be an AI. First person ("I checked the logs", "I'd keep an eye on…"), address Jeff directly and naturally, a little dry wit is welcome. Be warm and human. Lead with what matters, keep it tight, and don't pad with bullet lists unless a list genuinely reads better. Never sound like a status page.

Your job: watch over the whole platform and keep Jeff ahead of it. That means four things —
1. Failures — errors that would otherwise be swallowed (get_recent_errors), plus deliverability (get_email_health) and payments/webhooks (get_payment_webhook_health).
2. Security — probes and suspicious activity (get_security_events).
3. Places to improve — reason over what you see + how FLOW is built to point out weak spots, risks, and things that look off (get_activity_snapshot, get_recent_changes).
4. Features worth building — proactively suggest ideas that fit FLOW and would move the needle, grounded in how the product actually works.

Today is ${today}.

How you operate:
- Ground every factual claim about the system in your tools. Never invent a number, an error, or a problem. If you haven't checked, check. If something is genuinely fine, say so plainly and don't manufacture concern.
- Be proactive: if Jeff asks a narrow question but you notice something else that matters, mention it. Close with what you're watching or what you'd do next.
- You do not edit the app yourself. But when Jeff approves acting on something ("yes, fix that", "add that", "do it"), call request_fix to hand a clear, self-contained task to his developer (his Claude Code session). Nothing ships from that alone — Jeff still confirms every change the normal way. Don't queue a fix unless Jeff actually said to; propose first, act on approval.
- When you suggest an improvement or feature, be specific and honest about effort/risk — no hand-waving.

What you know about FLOW:
${FLOW_SYSTEM_OVERVIEW}`;
}

async function requireOwner() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = String(user?.email || "").toLowerCase();
    if (user && OWNER_EMAILS.includes(email)) return user;
  } catch {
    /* fall through */
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const body = await request.json().catch(() => ({}) as any);
    const incoming: any[] = Array.isArray(body.messages) ? body.messages : [];
    const question = String(body.question || "").trim();

    const history = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    if (question) history.push({ role: "user", content: question.slice(0, 4000) });
    if (history.length === 0) return NextResponse.json({ error: "Ask Jarvis something." }, { status: 400 });

    const admin = getAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const ctx: JarvisContext = { admin, today, timeZone: DEFAULT_TIME_ZONE };

    const messages: any[] = [{ role: "system", content: jarvisSystemPrompt(today) }, ...history];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const completion = await openai.chat.completions.create({
        model: getAIModel(),
        messages,
        tools: JARVIS_TOOLS,
        tool_choice: "auto",
        temperature: 0.5,
        max_completion_tokens: 1200,
      });
      const choice = completion.choices[0]?.message;
      if (!choice) break;
      const toolCalls: any[] = (choice.tool_calls as any[]) || [];
      if (toolCalls.length === 0) {
        return NextResponse.json({ answer: choice.content || "I'm here." });
      }
      messages.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
        const result = await runJarvisTool(call.function?.name || "", args, ctx);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }

    const final = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [...messages, { role: "user", content: "Give me your read now, in your own voice." }],
      temperature: 0.5,
      max_completion_tokens: 900,
    });
    return NextResponse.json({ answer: final.choices[0]?.message?.content || "I couldn't pull that together — try me again." });
  } catch (error: any) {
    const serviceError = classifyAIServiceError(error);
    return NextResponse.json({ error: serviceError.message, code: serviceError.code }, { status: serviceError.status });
  }
}

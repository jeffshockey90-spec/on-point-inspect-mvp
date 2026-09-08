import { NextResponse } from "next/server";
import { openai, getAIModel } from "../../../lib/openai";
import { getSessionUser, unauthorized, getAdminClient } from "../../../lib/apiAuth";
import { classifyAIServiceError } from "../../../lib/aiServiceError";
import { buildAskFlowContext, ASK_FLOW_TOOLS, runAskFlowTool } from "../../../lib/ai/askFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(ctx: { today: string; timeZone: string }, scope: "owner" | "inspector") {
  return `You are Ask FLOW, the built-in assistant inside FLOW — a home-inspection platform. You help this ${
    scope === "owner" ? "company owner" : "inspector"
  } answer questions about THEIR OWN inspection business using the tools provided.

Today is ${ctx.today} (timezone ${ctx.timeZone}). When a question uses relative time ("this week", "next 3 days", "last month", "MTD"), convert it to explicit from/to YYYY-MM-DD dates yourself before calling a tool.

How to work:
- ALWAYS answer from tool results — never invent numbers, names, addresses, dollar amounts, or dates. If you don't call a tool, you don't know the answer.
- Pick the right tool: get_business_summary for overviews/totals; search_inspections for lists of jobs; search_findings for specific defect questions across reports; get_inspection_detail for one property (it returns top_issues — use them to actually summarize the house's biggest problems, most serious first); get_schedule for availability/open-slot questions; get_defect_trends for aggregate defect analysis ("my most common findings", "which systems I write up most", "how many safety concerns this quarter"); get_report_turnaround for "how long / how fast do my reports take to publish".
- You may call multiple tools and call one more than once. Stop as soon as you can answer.
- If a tool returns nothing, say so plainly ("You have no unpaid inspections this week") — don't apologize at length or guess.

Answer style:
- Be concise and direct, like a sharp office manager. Lead with the answer.
- Use Markdown. Link an inspection as [123 Main St](/reports/ID) using the "link"/id from tool results. Format money as $1,250 and dates naturally (Sep 12).
- For lists, use short bullets. For counts/money, give the number first, details after.
- For any question about how long a component will last or when it will fail, only speak in TYPICAL service-life ranges and note that maintenance changes actual lifespan — never predict a hard failure or deadline.

Scope & limits:
- Everything you can see is already limited to this user's own business. Never mention other companies or inspectors outside their team.
- You are READ-ONLY right now. If asked to send, reschedule, change, mark paid, or otherwise take an action, explain you can look it up but can't make changes yet (that's coming soon), then give the relevant info so they can act.`;
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}) as any);
    const incoming: any[] = Array.isArray(body.messages) ? body.messages : [];
    const question = String(body.question || "").trim();

    // Accept either a full message history or a single question.
    const history = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    if (question) history.push({ role: "user", content: question.slice(0, 4000) });
    if (history.length === 0) {
      return NextResponse.json({ error: "Ask a question." }, { status: 400 });
    }

    const admin = getAdminClient();

    // Timezone (best-effort) for relative-date reasoning.
    let timeZone = "America/New_York";
    try {
      const { data } = await admin.from("profiles").select("time_zone").eq("id", user.id).maybeSingle();
      if (data?.time_zone) timeZone = data.time_zone;
    } catch {
      /* default */
    }

    const ctx = await buildAskFlowContext(admin, user.id, timeZone);
    const scope = ctx.filter.column === "company_id" ? "owner" : "inspector";

    const messages: any[] = [
      { role: "system", content: buildSystemPrompt(ctx, scope) },
      ...history,
    ];

    const toolTrace: { name: string; args: any }[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const completion = await openai.chat.completions.create({
        model: getAIModel(),
        messages,
        tools: ASK_FLOW_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_completion_tokens: 1100,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) break;

      const toolCalls: any[] = (choice.tool_calls as any[]) || [];
      if (toolCalls.length === 0) {
        return NextResponse.json({
          answer: choice.content || "I couldn't find an answer to that.",
          tools: toolTrace,
        });
      }

      // Execute each requested tool and feed the results back.
      messages.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }
        toolTrace.push({ name: call.function?.name || "?", args });
        let result: any;
        try {
          result = await runAskFlowTool(call.function?.name || "", args, ctx);
        } catch (e: any) {
          result = { error: e?.message || "Tool failed." };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 12000),
        });
      }
    }

    // Ran out of rounds — make one final call with no tools to force an answer.
    const final = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [...messages, { role: "user", content: "Answer now with what you have, concisely." }],
      temperature: 0.2,
      max_completion_tokens: 900,
    });
    return NextResponse.json({
      answer: final.choices[0]?.message?.content || "I couldn't complete that. Try rephrasing.",
      tools: toolTrace,
    });
  } catch (error: any) {
    const serviceError = classifyAIServiceError(error);
    return NextResponse.json(
      { error: serviceError.message, code: serviceError.code, retryable: serviceError.retryable },
      { status: serviceError.status },
    );
  }
}

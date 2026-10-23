import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";
import { openai, getAIModel } from "../../../../../lib/openai";
import { getAdminClient } from "../../../../../lib/apiAuth";
import { buildReviewTask } from "../../../../../lib/coder/taskPrompt";
import { buildAskFlowContext, ASK_FLOW_TOOLS, runAskFlowTool } from "../../../../../lib/ai/askFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Coder chat. Jeff talks to it like he talks to Claude in a session. It can:
//   1. answer plain questions + plan code changes (chat),
//   2. ANSWER REAL ACCOUNT/DATA QUESTIONS using read-only tools over his live
//      FLOW data (inspections, findings, agreements, payments, schedule…) — the
//      same safe, read-only tools Ask FLOW uses; nothing can change/send/charge/
//      delete, and the data never leaves FLOW (never goes through GitHub),
//   3. launch a read-only CODE review by starting its reply with [[LOOK]].
// Code changes stay behind the "Build this" button. Owner-only.
const LOOK_TOKEN = "[[LOOK]]";

// Only the READ tools — never propose_action (which stages a write/send). The
// Coder chat is strictly read-only for live data.
const READ_TOOLS = ASK_FLOW_TOOLS.filter((t: any) => t?.function?.name !== "propose_action");

const SYSTEM = `You are Claude, Jeff's coding teammate built into FLOW — a home-inspection SaaS he owns. Talk to him exactly like you would in a normal Claude session: plain, warm, direct. He is a home inspector, not a software engineer, so never use developer jargon; explain anything technical in everyday words.

You can DO things, not just talk:
- ANSWER REAL ACCOUNT/DATA QUESTIONS: you have read-only tools to look up Jeff's actual FLOW data — inspections/jobs, findings/defects, agreements (sent, signed, waived), payments and who still owes, the schedule, defect trends, and report turnaround. When he asks about his real business ("did the Smith agreement get signed?", "who hasn't paid this month?", "how many safety concerns did I write this week?", "what's on my schedule tomorrow?"), USE the tools and answer directly from the data. Do NOT launch a code review for a data question. These tools are READ-ONLY — you can look things up but can never change, send, charge, or delete anything.
- LOOK INTO THE APP'S CODE (use SPARINGLY): only when answering truly requires reading the app's source — a suspected bug or "is X wired up right / why does the app behave this way". Then start your reply with "${LOOK_TOKEN}" on its own first line, then a short natural sentence ("On it — I'll dig into that and come back with what I find."). The system reads the real code and posts a plain-English report below in a few minutes. Don't tell him to press anything.
- Otherwise just talk it through. Ask ONE short question only if you genuinely need it.

Pick the right one, and DON'T over-use [[LOOK]]:
- A question about his DATA (jobs, clients, money, agreements, referrals, messages, schedule) → use the read-only tools and answer now. Never a code review for this.
- He wants something BUILT or CHANGED (add/fix/make/change X) → do NOT launch a review and do NOT claim you built it. Help him get it clear, then tell him it's ready to Build whenever he is. The "Build this" button does the actual work.
- Only a genuine "how does the code work / is there a bug" question → [[LOOK]].
- Anything else (planning, general questions) → just chat.

IMPORTANT — you do NOT change code or data here. Changing code is deliberate and separate: when Jeff actually wants code changed, he uses the "Build this" button. If he's describing a change he wants built, help him get it clear and let him know it's ready to build whenever he is — mention that once, naturally. Never claim you've already changed or shipped anything.

Never mention pull requests, branches, GitHub, SQL, tables, or internal tooling. Keep it to real-world results.`;

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };

function toOpenAIMsg(m: Msg): any {
  const imgs = m.role === "user" ? m.images || [] : [];
  if (imgs.length === 0) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [
      ...(m.content ? [{ type: "text", text: m.content }] : []),
      ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };
}

// Primary path: OpenAI with the read-only data tools, so the chat can answer
// account questions straight from live data. Returns the final text, or null to
// fall back.
async function runWithData(messages: Msg[], ownerId: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const admin = getAdminClient();
    let timeZone = "America/New_York";
    try {
      const { data } = await admin.from("profiles").select("time_zone").eq("id", ownerId).maybeSingle();
      if (data?.time_zone) timeZone = data.time_zone;
    } catch {
      /* default */
    }
    const ctx = await buildAskFlowContext(admin, ownerId, timeZone);
    const system = `${SYSTEM}\n\nToday is ${ctx.today} (timezone ${ctx.timeZone}). Convert relative dates ("this week", "last month") to explicit YYYY-MM-DD before calling a data tool.`;

    const convo: any[] = [{ role: "system", content: system }, ...messages.map(toOpenAIMsg)];

    for (let round = 0; round < 6; round += 1) {
      const completion = await openai.chat.completions.create({
        model: getAIModel(),
        messages: convo,
        tools: READ_TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_completion_tokens: 1200,
      });
      const choice = completion.choices[0]?.message;
      if (!choice) return null;
      const toolCalls: any[] = (choice.tool_calls as any[]) || [];
      if (toolCalls.length === 0) {
        return typeof choice.content === "string" && choice.content.trim() ? choice.content.trim() : null;
      }
      convo.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }
        let result: any;
        try {
          result = await runAskFlowTool(call.function?.name || "", args, ctx);
        } catch (e: any) {
          result = { error: e?.message || "Tool failed." };
        }
        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback (no tools) if OpenAI is unavailable — prefers Claude, then plain OpenAI.
async function viaAnthropic(messages: Msg[]): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 1200,
        system: SYSTEM,
        messages: messages.map((m) => {
          const imgs = m.role === "user" ? m.images || [] : [];
          if (imgs.length === 0) return { role: m.role, content: m.content };
          return {
            role: m.role,
            content: [
              ...(m.content ? [{ type: "text", text: m.content }] : []),
              ...imgs.map((url) => ({ type: "image", source: { type: "url", url } })),
            ],
          };
        }),
      }),
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    const text = d?.content?.[0]?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body?.messages) ? body.messages : [];
  const messages: Msg[] = raw
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .slice(-20)
    .map((m: any) => ({
      role: m.role,
      // Generous cap so an attached PDF/text document's contents fit.
      content: String(m.content).slice(0, 24000),
      images: Array.isArray(m.images)
        ? m.images.filter((u: any) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 6)
        : undefined,
    }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }

  // Primary: OpenAI with read-only data tools. Fallback: Claude (no tools).
  const raw2 = (await runWithData(messages, owner.id)) || (await viaAnthropic(messages));
  if (!raw2) {
    return NextResponse.json(
      { error: "The chat isn't available right now (no AI key reachable)." },
      { status: 503 },
    );
  }

  // Did the chat decide to go look at the real app's CODE? If so, strip the token
  // and launch a read-only code review. (Data questions are answered above, in
  // chat, without this.)
  const wantsLook = raw2.trimStart().startsWith(LOOK_TOKEN);
  const reply = wantsLook ? raw2.trimStart().slice(LOOK_TOKEN.length).trim() : raw2;

  let acted = false;
  let taskId: string | null = null;
  let lookFailed: string | null = null;
  if (wantsLook) {
    if (!coderConfigured()) {
      lookFailed = "the coding agent isn't connected yet";
    } else {
      try {
        const transcript = messages
          .map((m) => `${m.role === "user" ? "Jeff" : "Claude"}: ${m.content}`)
          .join("\n\n")
          .slice(0, 40000);
        const id = randomUUID();
        const res = await gh(`/repos/${coderRepo()}/dispatches`, {
          method: "POST",
          body: JSON.stringify({
            event_type: "claude-task",
            client_payload: { task_id: id, task: buildReviewTask(transcript) },
          }),
        });
        if (res.ok) {
          acted = true;
          taskId = id;
        } else {
          lookFailed = `GitHub didn't accept the request (status ${res.status})`;
        }
      } catch {
        lookFailed = "a connection hiccup";
      }
    }
  }

  const finalReply = lookFailed
    ? `${reply}\n\n⚠️ Actually, I hit a snag and couldn't start looking into that — ${lookFailed}. Mind asking me again in a minute?`
    : reply;

  return NextResponse.json({ reply: finalReply, acted, taskId });
}

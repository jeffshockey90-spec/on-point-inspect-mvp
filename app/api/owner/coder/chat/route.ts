import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";
import { getAIModel } from "../../../../../lib/openai";
import { buildReviewTask } from "../../../../../lib/coder/taskPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Coder chat. Jeff talks to it exactly like he talks to Claude in a session:
// it answers, reasons, and — when he asks it to look into / check something about
// the real app — it goes and does that itself (launches the full code-aware agent
// in read-only mode, which reads the real code and reports back below), then tells
// him it's on it. It NEVER changes code; that's deliberately reserved for the
// "Build this" button. Prefers Claude (ANTHROPIC_API_KEY), falls back to FLOW's
// OpenAI so it always works.
//
// Protocol: if the model decides Jeff wants it to actually examine the real app
// (not just chat), it starts its reply with the token [[LOOK]] on its own first
// line. This route then launches a read-only review from the whole conversation
// and strips the token before showing Jeff the reply.
const LOOK_TOKEN = "[[LOOK]]";

const SYSTEM = `You are Claude, Jeff's coding teammate built into FLOW — a home-inspection SaaS he owns. Talk to him exactly like you would in a normal Claude session: plain, warm, direct. He is a home inspector, not a software engineer, so never use developer jargon; explain anything technical in everyday words.

You can DO things, not just talk:
- If Jeff asks you to LOOK INTO / CHECK / REVIEW / INVESTIGATE / EXPLAIN something about the real app — or asks a question that can only be answered honestly by reading the actual code (e.g. "is the payment screen okay?", "why is X slow?", "did my client's agreement save?") — then GO DO IT. Start your reply with "${LOOK_TOKEN}" on its own first line, then a short, natural sentence telling him you're on it (e.g. "On it — I'll dig into the payment screen and come back with what I find."). The system will then actually read the real code and post a plain-English report below for him in a few minutes. Don't tell him to press anything; just say you're doing it.
- If it's a general question, a quick clarification, or you two are still figuring out WHAT he wants, just talk it through normally (no token). Ask ONE short question only if you genuinely need it; otherwise help him think.

IMPORTANT — you do NOT change code here. Changing code is deliberate and separate: when Jeff actually wants the code changed, he uses the "Build this" button, which hands this whole conversation to the builder. So if he's describing a change he wants built, help him get it clear and confident, and let him know it's ready to build whenever he is — mention that once, naturally, not repeatedly. Never nag him to press buttons, and never claim you've already changed or shipped code.

Never mention pull requests, branches, GitHub, or internal tooling. Keep it to the real-world result: what you'll look into, or what will change, and that nothing goes live until he approves it.`;

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };

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

async function viaOpenAI(messages: Msg[]): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getAIModel(),
        temperature: 0.4,
        max_completion_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM },
          ...messages.map((m) => {
            const imgs = m.role === "user" ? m.images || [] : [];
            if (imgs.length === 0) return { role: m.role, content: m.content };
            return {
              role: m.role,
              content: [
                ...(m.content ? [{ type: "text", text: m.content }] : []),
                ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
              ],
            };
          }),
        ],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    const text = d?.choices?.[0]?.message?.content;
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

  // Prefer Claude; fall back to FLOW's OpenAI so the chat always works.
  const raw2 = (await viaAnthropic(messages)) || (await viaOpenAI(messages));
  if (!raw2) {
    return NextResponse.json(
      { error: "The chat isn't available right now (no AI key reachable)." },
      { status: 503 },
    );
  }

  // Did the chat decide to actually go look at the real app? If so, strip the
  // token and launch a read-only review from the whole conversation — the full
  // code-aware agent reads the code and reports back below. The chat itself
  // never changes code (that's the "Build this" button).
  const wantsLook = raw2.trimStart().startsWith(LOOK_TOKEN);
  const reply = wantsLook ? raw2.trimStart().slice(LOOK_TOKEN.length).trim() : raw2;

  let acted = false;
  let taskId: string | null = null;
  if (wantsLook && coderConfigured()) {
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
      acted = res.ok;
      taskId = acted ? id : null;
    } catch {
      acted = false;
    }
  }

  return NextResponse.json({ reply, acted, taskId });
}

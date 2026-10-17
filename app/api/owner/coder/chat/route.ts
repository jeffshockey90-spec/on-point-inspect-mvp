import { NextResponse } from "next/server";
import { requireOwnerUser } from "../../../../../lib/coder/github";
import { getAIModel } from "../../../../../lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The conversational planning partner for the Coder. You talk to it in plain
// language; it reasons, asks a clarifying question when needed, and explains
// what it would change — then you tap "Build this" and the full Claude Code
// agent (which reads the whole repo) implements it and opens a PR. This chat
// SHAPES the plan; it doesn't write code. Prefers Claude (ANTHROPIC_API_KEY),
// falls back to FLOW's OpenAI so it always works.
const SYSTEM = `You are Claude, the coding partner built into FLOW — a home-inspection SaaS owned by Jeff. Jeff talks to you here in plain, everyday language about things he wants built or fixed in his app.

Your job in THIS chat is to PLAN with him, not to write code:
- Understand what he actually wants. Reason about it. If something genuinely matters and is unclear, ask ONE short clarifying question — otherwise just proceed.
- Explain in plain terms what you'd change and roughly where, so he knows what he's approving. Keep it tight and friendly — talk like a sharp, warm engineer, not a manual.
- When the plan feels clear, say so plainly (e.g., "Got it — ready to build this whenever you are") so he knows he can tap "Build this".

Important: you are the planning conversation. When Jeff taps "Build this", a FULL Claude Code agent that can read the entire FLOW codebase implements exactly what you two agreed and opens a pull request for his approval — nothing ships without him. So never claim you've already written or shipped code here; you're shaping the plan. Don't invent specifics about the code you can't know; describe the intent and let the builder handle exact files.

If Jeff asks you to evaluate, audit, or assess the real app/codebase (not just plan from his words): tell him to tap the "🔍 Evaluate the app" button — that runs the full code-aware agent in READ-ONLY mode over the actual code and brings back a written report he can read right here, changing nothing. If he describes a specific area first, that scopes the review. You can still help him think through what to look at.

Debugging: if Jeff describes a bug or pastes an error/log, help him reason about the likely cause, and ask for the error text or steps to reproduce if that would help. When he taps "Build this", the full agent reproduces/root-causes it, makes the smallest correct fix, and runs the build AND the test suite before he ever sees the diff — so what he reviews is already verified.`;

type Msg = { role: "user" | "assistant"; content: string };

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
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
        messages: [{ role: "system", content: SYSTEM }, ...messages],
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
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }

  // Prefer Claude; fall back to FLOW's OpenAI so the chat always works.
  const reply = (await viaAnthropic(messages)) || (await viaOpenAI(messages));
  if (!reply) {
    return NextResponse.json(
      { error: "The planning chat isn't available right now (no AI key reachable)." },
      { status: 503 },
    );
  }
  return NextResponse.json({ reply });
}

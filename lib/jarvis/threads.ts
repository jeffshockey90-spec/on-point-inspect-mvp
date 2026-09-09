// Shared operations on Jarvis collaboration threads. All take a service-role
// admin client; the caller is responsible for auth (owner session or the
// bridge token). Server-only.

import { sendPushNotification } from "../push";
import { OWNER_EMAILS } from "../ownerEmails";

export type ThreadAuthor = "jarvis" | "owner" | "claude" | "gpt";
export type ThreadStatus = "open" | "in_progress" | "shipped" | "closed";

const STATUSES: ThreadStatus[] = ["open", "in_progress", "shipped", "closed"];

function authorLabel(a: string) {
  return a === "claude" ? "Claude" : a === "gpt" ? "GPT" : a === "jarvis" ? "Jarvis" : "Jeff";
}

// Push the owner whenever a teammate (Jarvis/Claude/GPT) posts (never for the
// owner's own messages). Best-effort — never blocks or throws.
async function notifyOwner(author: ThreadAuthor, title: string, text: string) {
  if (author === "owner") return;
  const who = author === "claude" ? "⚡ Claude" : author === "gpt" ? "💡 ChatGPT" : "🤖 Jarvis";
  const body = `${title ? `${title} — ` : ""}${String(text || "").replace(/\s+/g, " ").trim()}`.slice(0, 140);
  for (const email of OWNER_EMAILS) {
    try {
      await sendPushNotification({
        title: `${who} posted in Jarvis`,
        body,
        url: "/dashboard/owner/jarvis",
        eventType: "jarvis_thread",
        target: "user",
        targetUserEmail: email,
        ownerEmail: email,
      });
    } catch {
      /* best-effort */
    }
  }
}

// ChatGPT replies in a thread (read-only teammate). Unconditional — used by the
// "Ask GPT" button and by the @gpt auto-trigger below.
export async function triggerGpt(admin: any, threadId: string) {
  if (!threadId || !process.env.OPENAI_API_KEY) return;
  try {
    const { gptRespond } = await import("./agent");
    const { data: thread } = await admin.from("jarvis_threads").select("title, status").eq("id", threadId).maybeSingle();
    if (thread?.status === "closed") return;
    const { data: msgs } = await admin.from("jarvis_messages").select("author, body").eq("thread_id", threadId).order("created_at", { ascending: true });
    const history = (msgs || []).map((m: any) => ({
      role: m.author === "gpt" ? "assistant" : "user",
      content: m.author === "gpt" ? String(m.body) : `[${authorLabel(m.author)}] ${m.body}`,
    }));
    history.push({ role: "user", content: "Respond in this thread as GPT — the strategist teammate. Read the whole thread and reply to the latest message. Stay in your lane (ideas, strategy, framing, second opinions), ground anything factual in your read-only tools, and talk to Jeff, Jarvis, and Claude directly. Keep it tight." });
    const today = new Date().toISOString().slice(0, 10);
    const text = await gptRespond({
      admin, today, timeZone: "America/New_York", history,
      extraSystem: `You are posting inside a work thread titled "${thread?.title || "(untitled)"}". Teammates: Jeff (owner), Jarvis (ops), Claude (dev).`,
    });
    if (text) await addMessage(admin, { threadId, author: "gpt", body: text });
  } catch (e: any) {
    console.error("GPT trigger failed:", e?.message || e);
  }
}

// Auto-summon GPT when a message @gpt-tags it (from anyone but GPT itself).
async function maybeTriggerGpt(admin: any, threadId: string, author: ThreadAuthor, body: string) {
  if (author === "gpt") return;
  if (!/@gpt\b/i.test(String(body || ""))) return;
  await triggerGpt(admin, threadId);
}

export async function createThread(
  admin: any,
  input: { title: string; severity?: string; origin?: "jarvis" | "owner"; author: ThreadAuthor; body: string; meta?: any },
): Promise<{ id: string | null; error?: string }> {
  const title = String(input.title || "").trim().slice(0, 200);
  const body = String(input.body || "").trim();
  if (!title || !body) return { id: null, error: "Thread needs a title and an opening message." };
  const severity = ["info", "warning", "critical"].includes(String(input.severity)) ? input.severity : "warning";

  const { data: thread, error } = await admin
    .from("jarvis_threads")
    .insert({ title, severity, origin: input.origin || "jarvis", status: "open" })
    .select("id")
    .maybeSingle();
  if (error) return { id: null, error: error.message };

  const id = thread?.id;
  if (id) {
    await admin.from("jarvis_messages").insert({ thread_id: id, author: input.author, body, meta: input.meta || null });
    await notifyOwner(input.author, title, body);
    await maybeTriggerGpt(admin, id, input.author, body);
  }
  return { id: id || null };
}

export async function addMessage(
  admin: any,
  input: { threadId: string; author: ThreadAuthor; body: string; meta?: any; status?: string },
): Promise<{ ok: boolean; error?: string }> {
  const threadId = String(input.threadId || "").trim();
  const body = String(input.body || "").trim();
  if (!threadId || !body) return { ok: false, error: "Missing thread id or message." };

  const { error } = await admin
    .from("jarvis_messages")
    .insert({ thread_id: threadId, author: input.author, body, meta: input.meta || null });
  if (error) return { ok: false, error: error.message };

  const patch: any = { updated_at: new Date().toISOString() };
  if (input.status && STATUSES.includes(input.status as ThreadStatus)) patch.status = input.status;
  await admin.from("jarvis_threads").update(patch).eq("id", threadId);
  await notifyOwner(input.author, "", body);
  await maybeTriggerGpt(admin, threadId, input.author, body);
  return { ok: true };
}

export async function setStatus(admin: any, threadId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!STATUSES.includes(status as ThreadStatus)) return { ok: false, error: "Invalid status." };
  const { error } = await admin
    .from("jarvis_threads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", threadId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listThreads(
  admin: any,
  opts: { status?: string; limit?: number } = {},
): Promise<{ threads: any[]; error?: string }> {
  let q = admin
    .from("jarvis_threads")
    .select("id, title, status, severity, origin, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.min(opts.limit || 50, 100));
  if (opts.status) q = q.eq("status", opts.status);
  const { data: threads, error } = await q;
  if (error) return { threads: [], error: error.message };

  const ids = (threads || []).map((t: any) => t.id);
  let messages: any[] = [];
  if (ids.length) {
    const { data: msgs } = await admin
      .from("jarvis_messages")
      .select("id, thread_id, author, body, meta, created_at")
      .in("thread_id", ids)
      .order("created_at", { ascending: true });
    messages = msgs || [];
  }
  const byThread = new Map<string, any[]>();
  messages.forEach((m: any) => {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
    byThread.get(m.thread_id)!.push(m);
  });

  return { threads: (threads || []).map((t: any) => ({ ...t, messages: byThread.get(t.id) || [] })) };
}

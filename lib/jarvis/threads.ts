// Shared operations on Jarvis collaboration threads. All take a service-role
// admin client; the caller is responsible for auth (owner session or the
// bridge token). Server-only.

export type ThreadAuthor = "jarvis" | "owner" | "claude";
export type ThreadStatus = "open" | "in_progress" | "shipped" | "closed";

const STATUSES: ThreadStatus[] = ["open", "in_progress", "shipped", "closed"];

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

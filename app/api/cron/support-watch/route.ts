import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import { addMessage } from "../../../../lib/jarvis/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sarah's proactive loop: find inspector support threads where the inspector
// spoke last (awaiting a reply), draft a reply for each, and post it into the
// "Sarah · Support drafts" workspace thread with an Approve & send button
// (meta.support_thread_id). Nothing is sent to an inspector automatically —
// Jeff approves each draft. CRON_SECRET-gated.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const xcs = req.headers.get("x-cron-secret") || "";
  if (secret && auth !== `Bearer ${secret}` && xcs !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const MAX_DRAFTS = 5;
  const drafted: string[] = [];

  try {
    const { data: threads } = await admin
      .from("inspector_support_threads")
      .select("id, inspector_email, last_message_at, status")
      .order("last_message_at", { ascending: false })
      .limit(25);

    const { supportRespond } = await import("../../../../lib/jarvis/agent");

    // Find-or-create the single workspace thread that collects Sarah's drafts.
    let jThreadId: string | null = null;
    {
      const { data: existing } = await admin
        .from("jarvis_threads")
        .select("id")
        .eq("title", "Sarah · Support drafts")
        .maybeSingle();
      jThreadId = existing?.id || null;
      if (!jThreadId) {
        const { data: created } = await admin
          .from("jarvis_threads")
          .insert({ title: "Sarah · Support drafts", severity: "info", origin: "jarvis", status: "open" })
          .select("id")
          .maybeSingle();
        jThreadId = created?.id || null;
      }
    }
    if (!jThreadId) return NextResponse.json({ ok: true, drafted: 0, note: "no workspace thread" });

    for (const t of threads || []) {
      if (drafted.length >= MAX_DRAFTS) break;
      if (String(t.status) === "closed") continue;

      const { data: msgs } = await admin
        .from("inspector_support_messages")
        .select("sender_role, message, created_at")
        .eq("thread_id", t.id)
        .order("created_at", { ascending: false })
        .limit(8);
      const recent = (msgs || []).slice().reverse();
      const last = recent[recent.length - 1];
      if (!last || last.sender_role !== "inspector") continue; // not awaiting a reply

      // Skip if we already drafted for THIS latest inspector message.
      const { data: already } = await admin
        .from("jarvis_messages")
        .select("id")
        .eq("author", "support")
        .gt("created_at", last.created_at)
        .contains("meta", { support_thread_id: t.id })
        .limit(1);
      if (already && already.length) continue;

      const history = recent.map((m: any) => ({
        role: m.sender_role === "inspector" ? "user" : "assistant",
        content: String(m.message || ""),
      }));
      history.push({
        role: "user",
        content:
          "Draft ONE reply to send to this inspector — warm, concise, correct, solving their issue with the exact steps. Output ONLY the reply text: no preamble, no 'Draft:', no signature.",
      });

      // eslint-disable-next-line no-await-in-loop
      const draft = String(
        await supportRespond({ admin, today, timeZone: "America/New_York", history }),
      ).trim();
      if (!draft) continue;

      // eslint-disable-next-line no-await-in-loop
      await addMessage(admin, {
        threadId: jThreadId,
        author: "support",
        body: `Draft reply for ${t.inspector_email || "an inspector"}:\n\n${draft}`,
        meta: { support_thread_id: t.id, draft, inspector_email: t.inspector_email },
      });
      drafted.push(String(t.id));
    }

    return NextResponse.json({ ok: true, drafted: drafted.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "support-watch failed." }, { status: 500 });
  }
}

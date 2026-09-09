import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { jarvisRespond } from "../../../../lib/jarvis/agent";
import { DEFAULT_TIME_ZONE } from "../../../../lib/app-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const answer = await jarvisRespond({ admin, today, timeZone: DEFAULT_TIME_ZONE, history });
    return NextResponse.json({ answer: answer || "I'm here." });
  } catch (error: any) {
    const serviceError = classifyAIServiceError(error);
    return NextResponse.json({ error: serviceError.message, code: serviceError.code }, { status: serviceError.status });
  }
}

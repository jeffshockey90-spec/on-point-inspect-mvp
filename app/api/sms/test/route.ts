import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { isSmsConfigured, sendSms } from "../../../../lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

// Owner-only: send a one-off test text to confirm the Twilio wiring works.
export async function POST(req: Request) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!OWNER_EMAILS.includes(String(user.email || "").toLowerCase())) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }
  if (!isSmsConfigured()) {
    return NextResponse.json(
      { error: "SMS is not configured yet." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || "").trim();
  if (!to) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  const result = await sendSms({
    to,
    body:
      "FLOW test: your text messaging is set up and working. Reply STOP to opt out.",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Test text failed to send." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sid: result.sid, to: result.to });
}

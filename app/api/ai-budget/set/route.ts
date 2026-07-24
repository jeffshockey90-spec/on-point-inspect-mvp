import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { setAIBudget } from "../../../../lib/aiBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = [
  "jeffshockey90@gmail.com",
  "jeff@onpointhomeinspect.com",
];

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

export async function POST(req: Request) {
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const userEmail = String(user.email || "").toLowerCase();
    if (!OWNER_EMAILS.includes(userEmail)) {
      return NextResponse.json({ error: "Owner only." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const startingBalanceUsd = Number(body.startingBalanceUsd);
    const thresholdUsd = Number(body.thresholdUsd);

    if (!Number.isFinite(startingBalanceUsd) || startingBalanceUsd < 0) {
      return NextResponse.json({ error: "Invalid balance amount." }, { status: 400 });
    }
    if (!Number.isFinite(thresholdUsd) || thresholdUsd < 0) {
      return NextResponse.json({ error: "Invalid threshold amount." }, { status: 400 });
    }

    const status = await setAIBudget({ startingBalanceUsd, thresholdUsd });
    return NextResponse.json({ ok: true, status });
  } catch (error: any) {
    console.error("AI budget set error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update AI budget." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAIBudgetStatus } from "../../../../lib/aiBudget";

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

export async function GET() {
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

    const status = await getAIBudgetStatus();
    return NextResponse.json({ ok: true, status });
  } catch (error: any) {
    console.error("AI budget status error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load AI budget status." },
      { status: 500 }
    );
  }
}

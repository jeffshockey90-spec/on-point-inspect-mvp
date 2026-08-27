import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTheme(value: unknown): "light" | "dark" {
  return value === "light" ? "light" : "dark";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data } = await supabase
    .from("profiles")
    .select("theme")
    .eq("id", user.id)
    .maybeSingle();

  // null theme = user hasn't chosen; the client keeps whatever it had (dark default).
  return NextResponse.json({ theme: data?.theme ?? null });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const theme = normalizeTheme(body?.theme);

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, theme }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, theme });
}

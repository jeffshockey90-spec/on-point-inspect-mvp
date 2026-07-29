import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = ["new", "planned", "in_progress", "shipped", "declined"];

async function requireOwner() {
  const cookieStore = await cookies();

  const userClient = createServerClient(
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

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return null;

  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

export async function POST(req: Request) {
  const owner = await requireOwner();

  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const status = String(body.status || "");
  const ownerNote = body.ownerNote != null ? String(body.ownerNote) : undefined;

  if (!id || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const update: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (ownerNote !== undefined) update.owner_note = ownerNote;

  const { error } = await admin.from("feature_requests").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

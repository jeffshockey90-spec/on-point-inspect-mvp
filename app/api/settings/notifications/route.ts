import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import {
  NOTIFICATION_PREF_KEYS,
  COMPANY_PREF_COLUMN,
  type NotificationPrefKey,
} from "../../../../lib/notificationPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function resolveContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await admin
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isOwner =
    membership?.role === "owner" || OWNER_EMAILS.includes(String(user.email || "").toLowerCase());
  return { userId: user.id, companyId: membership?.company_id || null, isOwner };
}

async function readState(ctx: { userId: string; companyId: string | null }) {
  const company: Record<string, boolean> = {};
  if (ctx.companyId) {
    const cols = NOTIFICATION_PREF_KEYS.map((k) => COMPANY_PREF_COLUMN[k]).join(", ");
    const { data } = await admin.from("companies").select(cols).eq("id", ctx.companyId).maybeSingle();
    for (const key of NOTIFICATION_PREF_KEYS) {
      const v = (data as any)?.[COMPANY_PREF_COLUMN[key]];
      company[key] = typeof v === "boolean" ? v : true;
    }
  } else {
    for (const key of NOTIFICATION_PREF_KEYS) company[key] = true;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("notification_prefs")
    .eq("id", ctx.userId)
    .maybeSingle();
  const overrides: Record<string, boolean> = {};
  const raw = profile?.notification_prefs;
  if (raw && typeof raw === "object") {
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (typeof (raw as any)[key] === "boolean") overrides[key] = (raw as any)[key];
    }
  }

  const effective: Record<string, boolean> = {};
  for (const key of NOTIFICATION_PREF_KEYS) {
    effective[key] = key in overrides ? overrides[key] : company[key];
  }
  return { company, overrides, effective };
}

export async function GET() {
  const ctx = await resolveContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const state = await readState(ctx);
  return NextResponse.json({ isOwner: ctx.isOwner, ...state });
}

export async function POST(req: Request) {
  const ctx = await resolveContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}) as any);
  const scope = body?.scope === "company" ? "company" : "inspector";
  const prefs = body?.prefs && typeof body.prefs === "object" ? body.prefs : {};

  if (scope === "company") {
    if (!ctx.isOwner || !ctx.companyId) {
      return NextResponse.json({ error: "Only the company owner can set the defaults." }, { status: 403 });
    }
    const updates: Record<string, boolean> = {};
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (typeof prefs[key] === "boolean") updates[COMPANY_PREF_COLUMN[key]] = prefs[key];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const { error } = await admin.from("companies").update(updates).eq("id", ctx.companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Merge into the caller's per-inspector override. `null` for a key clears it
    // (back to inheriting the company default); a boolean overrides.
    const { data: profile } = await admin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", ctx.userId)
      .maybeSingle();
    const current: Record<string, any> =
      profile?.notification_prefs && typeof profile.notification_prefs === "object"
        ? { ...profile.notification_prefs }
        : {};
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (key in prefs) {
        if (prefs[key] === null) delete current[key];
        else if (typeof prefs[key] === "boolean") current[key] = prefs[key];
      }
    }
    if (body?.reset === true) {
      for (const key of NOTIFICATION_PREF_KEYS) delete current[key];
    }
    const { error } = await admin.from("profiles").update({ notification_prefs: current }).eq("id", ctx.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const state = await readState(ctx);
  return NextResponse.json({ ok: true, isOwner: ctx.isOwner, ...state });
}

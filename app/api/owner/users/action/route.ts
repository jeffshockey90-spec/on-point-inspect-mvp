import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } });
}
function createAdminClient() { return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }); }
async function requireOwner() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  const email = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(email)) return null;
  return user;
}
async function safeUpdate(admin: any, table: string, userId: string, email: string, values: any) {
  const results: any[] = [];
  for (const column of ["id", "user_id", "auth_user_id", "inspector_id"]) {
    if (!userId) continue;
    try { const { error, count } = await admin.from(table).update(values, { count: "exact" }).eq(column, userId); if (!error) results.push({ table, column, count: count || 0 }); } catch {}
  }
  for (const column of ["email", "user_email", "owner_email", "auth_email"]) {
    if (!email) continue;
    try { const { error, count } = await admin.from(table).update(values, { count: "exact" }).eq(column, email); if (!error) results.push({ table, column, count: count || 0 }); } catch {}
  }
  return results;
}
async function safeInsertEvent(admin: any, eventType: string, metadata: any) {
  try { await admin.from("app_device_events").insert({ event_type: eventType, path: "/api/owner/users/action", device_id: "owner_user_action", platform: "server", standalone: true, metadata }); } catch {}
}
export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim().toLowerCase();
    const userId = String(body.userId || body.user_id || "").trim();
    const email = String(body.email || body.user_email || "").trim().toLowerCase();
    const role = String(body.role || "").trim().toLowerCase();
    if (!action) return NextResponse.json({ error: "Missing owner action." }, { status: 400 });
    if (!userId && !email) return NextResponse.json({ error: "Missing user ID or email." }, { status: 400 });
    if (email && OWNER_EMAILS.includes(email) && ["suspend", "delete"].includes(action)) return NextResponse.json({ error: "The owner account cannot be suspended or deleted from this tool." }, { status: 400 });
    const admin = createAdminClient();
    const now = new Date().toISOString();
    let message = "Action completed.";
    let results: any[] = [];
    if (action === "suspend") { for (const table of ["profiles", "company_users", "inspector_profiles"]) results.push(...await safeUpdate(admin, table, userId, email, { is_active: false, disabled_at: now, suspended_at: now, updated_at: now })); message = "Account suspended where supported."; }
    if (action === "reactivate") { for (const table of ["profiles", "company_users", "inspector_profiles"]) results.push(...await safeUpdate(admin, table, userId, email, { is_active: true, disabled_at: null, suspended_at: null, deleted_at: null, deletion_requested_at: null, updated_at: now })); message = "Account reactivated where supported."; }
    if (action === "delete") { for (const table of ["profiles", "company_users", "inspector_profiles"]) results.push(...await safeUpdate(admin, table, userId, email, { is_active: false, deleted_at: now, deletion_requested_at: now, updated_at: now })); message = "Account soft-deleted where supported."; }
    if (action === "role") { if (!role) return NextResponse.json({ error: "Missing role." }, { status: 400 }); for (const table of ["profiles", "company_users", "inspector_profiles"]) results.push(...await safeUpdate(admin, table, userId, email, { role, account_type: role, user_role: role, is_inspector: ["inspector", "owner", "admin"].includes(role), updated_at: now })); message = `Role changed to ${role} where supported.`; }
    if (action === "clear_push") { if (userId) { await admin.from("app_native_push_tokens").update({ enabled: false, updated_at: now }).eq("user_id", userId); await admin.from("app_push_subscriptions").update({ enabled: false, updated_at: now }).eq("user_id", userId); } if (email) { await admin.from("app_native_push_tokens").update({ enabled: false, updated_at: now }).eq("user_email", email); await admin.from("app_push_subscriptions").update({ enabled: false, updated_at: now }).eq("user_email", email); } message = "Push devices disabled for this user."; }
    if (action === "reset") { if (!email) return NextResponse.json({ error: "Email is required for password reset." }, { status: 400 }); const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.flowinspect.app").replace(/\/$/, ""); const redirectTo = `${baseUrl}/reset-password`; const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw error; message = "Password reset email sent."; }
    await safeInsertEvent(admin, "owner_user_action", { owner_id: owner.id, owner_email: owner.email || null, action, target_user_id: userId || null, target_email: email || null, role: role || null, results });
    return NextResponse.json({ ok: true, message, results });
  } catch (error: any) {
    console.error("Owner user action error:", error);
    return NextResponse.json({ error: error?.message || "Owner action failed." }, { status: 500 });
  }
}

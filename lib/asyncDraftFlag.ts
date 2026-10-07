// Resolver for the Live Camera "async draft in the background" beta flag.
//
// A draft runs async ONLY when BOTH are true:
//   1. the owner-controlled GLOBAL kill switch is on (feature_flags.async_draft_global), AND
//   2. the inspector opted in (profiles.async_draft_enabled).
//
// Fail-safe is OFF: any read error returns false, so a flag-fetch failure can
// never strand the inspector in a half-built experience — they just get today's
// synchronous flow. See LIVE_CAMERA_ASYNC_DRAFT_DESIGN.md §7b.

import { createClient as createServiceClient } from "@supabase/supabase-js";

const GLOBAL_FLAG_KEY = "async_draft_global";
const GLOBAL_CACHE_TTL_MS = 30_000;

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

let globalCache: { value: boolean; at: number } | null = null;

// Owner-controlled global kill switch. Missing row = ON (the per-inspector
// toggle is the real gate, and it defaults OFF). Any thrown error = OFF.
export async function getAsyncDraftGlobalEnabled(): Promise<boolean> {
  if (globalCache && Date.now() - globalCache.at < GLOBAL_CACHE_TTL_MS) {
    return globalCache.value;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_flags")
      .select("enabled")
      .eq("key", GLOBAL_FLAG_KEY)
      .maybeSingle();
    if (error) throw error;
    // No row configured yet → treat as ON (per-inspector opt-in still gates it).
    const value = data ? Boolean(data.enabled) : true;
    globalCache = { value, at: Date.now() };
    return value;
  } catch {
    return false; // fail-safe OFF
  }
}

export async function setAsyncDraftGlobalEnabled(enabled: boolean): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("feature_flags")
    .upsert(
      { key: GLOBAL_FLAG_KEY, enabled, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
  globalCache = { value: enabled, at: Date.now() };
  return enabled;
}

// The effective per-inspector flag = global AND their own opt-in.
export async function isAsyncDraftEnabledForUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const globalOn = await getAsyncDraftGlobalEnabled();
    if (!globalOn) return false;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("async_draft_enabled")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.async_draft_enabled);
  } catch {
    return false; // fail-safe OFF
  }
}

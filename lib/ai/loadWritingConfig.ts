// Server-only loader for a company's AI Writing Studio config.
// Uses the service-role client so any finding-writer route can read the saved
// style without cookie/RLS juggling. Never import this from client code.

import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_AI_WRITING_CONFIG,
  normalizeWritingConfig,
  type AiWritingConfig,
} from "./writingStyle";

function admin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Short-TTL, per-process cache so the live camera doesn't re-query the writing
// config (2 round-trips) on EVERY capture during a burst — the config changes at
// most a few times a day. The TTL bounds staleness to seconds, and it's cleared
// outright when the config is saved (invalidateWritingConfigCache). Only
// SUCCESSFUL reads are cached, so a transient error never sticks. This does not
// change what the writer receives — same config, just not re-fetched each photo.
const WRITING_CONFIG_TTL_MS = 90 * 1000;
const writingConfigCache = new Map<
  string,
  { value: AiWritingConfig; expires: number }
>();

function getCachedConfig(key: string): AiWritingConfig | null {
  const hit = writingConfigCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) writingConfigCache.delete(key);
  return null;
}

function setCachedConfig(key: string, value: AiWritingConfig) {
  writingConfigCache.set(key, {
    value,
    expires: Date.now() + WRITING_CONFIG_TTL_MS,
  });
}

// Call after saving the AI Writing Studio config so the next capture picks it up
// immediately instead of waiting out the TTL (best-effort within a process).
export function invalidateWritingConfigCache() {
  writingConfigCache.clear();
}

async function readByCompany(
  db: any,
  companyId: number | string,
): Promise<AiWritingConfig> {
  const { data } = await db
    .from("company_ai_writing_settings")
    .select("config")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data?.config) return DEFAULT_AI_WRITING_CONFIG;
  return normalizeWritingConfig(data.config);
}

// Load the writing config for the company that a given user belongs to.
// Always resolves to a valid config (falls back to defaults on any miss), so
// finding writers can call it unconditionally.
export async function loadWritingConfigForUser(
  userId: string | null | undefined,
): Promise<AiWritingConfig> {
  const db = admin();
  if (!db || !userId) return DEFAULT_AI_WRITING_CONFIG;

  const cacheKey = `user:${userId}`;
  const cached = getCachedConfig(cacheKey);
  if (cached) return cached;

  try {
    const { data: memberships } = await db
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", userId)
      .not("company_id", "is", null);

    const rows = memberships || [];
    const owned = rows.find((r: any) => r.role === "owner");
    const companyId = (owned || rows[0])?.company_id ?? null;
    if (!companyId) return DEFAULT_AI_WRITING_CONFIG;

    const config = await readByCompany(db, companyId);
    setCachedConfig(cacheKey, config);
    return config;
  } catch {
    return DEFAULT_AI_WRITING_CONFIG;
  }
}

// Load by inspection id — resolves the owning company from the inspection.
// Useful for routes that have inspection context but no reliable user id.
export async function loadWritingConfigForInspection(
  inspectionId: string | number | null | undefined,
): Promise<AiWritingConfig> {
  const db = admin();
  if (!db || inspectionId == null || inspectionId === "") {
    return DEFAULT_AI_WRITING_CONFIG;
  }

  const cacheKey = `inspection:${inspectionId}`;
  const cached = getCachedConfig(cacheKey);
  if (cached) return cached;

  try {
    const { data: inspection } = await db
      .from("inspections")
      .select("company_id")
      .eq("id", inspectionId)
      .maybeSingle();

    const companyId = (inspection as any)?.company_id ?? null;
    if (!companyId) return DEFAULT_AI_WRITING_CONFIG;

    const config = await readByCompany(db, companyId);
    setCachedConfig(cacheKey, config);
    return config;
  } catch {
    return DEFAULT_AI_WRITING_CONFIG;
  }
}

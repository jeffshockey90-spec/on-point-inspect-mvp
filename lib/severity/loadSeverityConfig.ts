// Server-only loader for a company's custom severity config. Uses the
// service-role client so any route can read it without cookie/RLS juggling.
// Never import this from client code. Always resolves to a valid config.

import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_SEVERITY_CONFIG,
  normalizeSeverityConfig,
  type SeverityConfig,
} from "./severityConfig";

function admin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readByCompany(db: any, companyId: number | string): Promise<SeverityConfig> {
  const { data } = await db
    .from("company_severity_settings")
    .select("config")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data?.config || !Object.keys(data.config).length) return DEFAULT_SEVERITY_CONFIG;
  return normalizeSeverityConfig(data.config);
}

export async function loadSeverityConfigForUser(
  userId: string | null | undefined,
): Promise<SeverityConfig> {
  const db = admin();
  if (!db || !userId) return DEFAULT_SEVERITY_CONFIG;

  try {
    const { data: memberships } = await db
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", userId)
      .not("company_id", "is", null);

    const rows = memberships || [];
    const owned = rows.find((r: any) => r.role === "owner");
    const companyId = (owned || rows[0])?.company_id ?? null;
    if (!companyId) return DEFAULT_SEVERITY_CONFIG;

    return await readByCompany(db, companyId);
  } catch {
    return DEFAULT_SEVERITY_CONFIG;
  }
}

export async function loadSeverityConfigForInspection(
  inspectionId: string | number | null | undefined,
): Promise<SeverityConfig> {
  const db = admin();
  if (!db || inspectionId == null || inspectionId === "") return DEFAULT_SEVERITY_CONFIG;

  try {
    const { data: inspection } = await db
      .from("inspections")
      .select("company_id")
      .eq("id", inspectionId)
      .maybeSingle();

    const companyId = (inspection as any)?.company_id ?? null;
    if (!companyId) return DEFAULT_SEVERITY_CONFIG;

    return await readByCompany(db, companyId);
  } catch {
    return DEFAULT_SEVERITY_CONFIG;
  }
}

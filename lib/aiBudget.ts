import { createClient as createServiceClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export type AIBudgetRow = {
  id: number;
  starting_balance_usd: number;
  low_balance_threshold_usd: number;
  balance_set_at: string;
  last_alert_sent_at: string | null;
  updated_at: string;
};

export type AIBudgetStatus = {
  startingBalanceUsd: number;
  thresholdUsd: number;
  balanceSetAt: string;
  lastAlertSentAt: string | null;
  spentSinceSetUsd: number;
  remainingUsd: number;
  low: boolean;
};

// OpenAI's Costs API only supports 1-day buckets and caps each page at 180
// buckets, so a query spanning more than ~180 days needs to paginate via
// `next_page`. Loops defensively in case the owner never resets their balance.
async function fetchOpenAICostsSince(startTimeUnixSeconds: number): Promise<number> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;

  if (!adminKey) {
    throw new Error(
      "Missing OPENAI_ADMIN_KEY. Generate an Admin API key at platform.openai.com (Settings -> Organization -> Admin keys) and set it as an env var."
    );
  }

  let total = 0;
  let page: string | null = null;

  for (let i = 0; i < 20; i += 1) {
    const params = new URLSearchParams({
      start_time: String(startTimeUnixSeconds),
      limit: "180",
      bucket_width: "1d",
    });
    if (page) params.set("page", page);

    const response = await fetch(
      `https://api.openai.com/v1/organization/costs?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${adminKey}` },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpenAI Costs API request failed (${response.status}): ${text.slice(0, 300)}`
      );
    }

    const json: any = await response.json();

    for (const bucket of json?.data || []) {
      for (const result of bucket?.results || []) {
        total += Number(result?.amount?.value || 0);
      }
    }

    if (!json?.has_more || !json?.next_page) break;
    page = json.next_page;
  }

  return total;
}

async function getRow(admin: ReturnType<typeof createAdminClient>): Promise<AIBudgetRow> {
  const { data, error } = await admin
    .from("ai_budget_status")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const defaults = {
      id: 1,
      starting_balance_usd: 0,
      low_balance_threshold_usd: 2,
      balance_set_at: new Date().toISOString(),
      last_alert_sent_at: null,
      updated_at: new Date().toISOString(),
    };
    const { data: inserted, error: insertError } = await admin
      .from("ai_budget_status")
      .insert(defaults)
      .select("*")
      .single();
    if (insertError) throw insertError;
    return inserted as AIBudgetRow;
  }

  return data as AIBudgetRow;
}

export async function getAIBudgetStatus(): Promise<AIBudgetStatus> {
  const admin = createAdminClient();
  const row = await getRow(admin);

  const balanceSetAtUnix = Math.floor(new Date(row.balance_set_at).getTime() / 1000);
  const spentSinceSetUsd = await fetchOpenAICostsSince(balanceSetAtUnix);
  const remainingUsd = Number(row.starting_balance_usd) - spentSinceSetUsd;

  return {
    startingBalanceUsd: Number(row.starting_balance_usd),
    thresholdUsd: Number(row.low_balance_threshold_usd),
    balanceSetAt: row.balance_set_at,
    lastAlertSentAt: row.last_alert_sent_at,
    spentSinceSetUsd,
    remainingUsd,
    low: remainingUsd <= Number(row.low_balance_threshold_usd),
  };
}

export async function setAIBudget(input: { startingBalanceUsd: number; thresholdUsd: number }) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("ai_budget_status")
    .update({
      starting_balance_usd: input.startingBalanceUsd,
      low_balance_threshold_usd: input.thresholdUsd,
      balance_set_at: new Date().toISOString(),
      last_alert_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) throw error;

  return getAIBudgetStatus();
}

export async function markAIBudgetAlertSent() {
  const admin = createAdminClient();

  await admin
    .from("ai_budget_status")
    .update({ last_alert_sent_at: new Date().toISOString() })
    .eq("id", 1);
}

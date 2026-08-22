import crypto from "crypto";

// QuickBooks Online (Intuit) OAuth2 + accounting sync. Reuses the same cookie-
// free HMAC-state OAuth pattern built for Google Calendar. Secrets are server-
// env only.
//
// Env:
//   QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET  (Intuit app keys)
//   QUICKBOOKS_ENVIRONMENT = "production" | "sandbox" (default production)
// Redirect URI is derived from the site URL and must match the one registered
// in the Intuit developer portal.

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPES = ["com.intuit.quickbooks.accounting"];
const MINOR_VERSION = "70";

// CSRF state bound to the user via HMAC (cookies don't reliably survive the
// OAuth redirect in app webviews). The callback recomputes and compares.
export function intuitOAuthState(userId: string) {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.QUICKBOOKS_CLIENT_SECRET ||
    "flow-state";
  return crypto
    .createHmac("sha256", secret)
    .update(`qbo:${userId}`)
    .digest("hex");
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flowinspect.app"
  ).replace(/\/$/, "");
}

export function quickbooksRedirectUri() {
  return `${siteUrl()}/api/quickbooks/callback`;
}

export function isQuickBooksConfigured() {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET,
  );
}

function apiBase() {
  return process.env.QUICKBOOKS_ENVIRONMENT === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export function getQuickBooksAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID || "",
    response_type: "code",
    scope: SCOPES.join(" "),
    redirect_uri: quickbooksRedirectUri(),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader() {
  const raw = `${process.env.QUICKBOOKS_CLIENT_ID || ""}:${process.env.QUICKBOOKS_CLIENT_SECRET || ""}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body),
  });
  return res.json();
}

export async function exchangeCodeForTokens(code: string) {
  const data = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: quickbooksRedirectUri(),
  });
  return {
    access_token: data.access_token as string | undefined,
    refresh_token: data.refresh_token as string | undefined,
    expires_in: Number(data.expires_in) || 3600,
    error: data.error_description || data.error || null,
  };
}

// Return a valid access token, refreshing (and rotating the refresh token —
// Intuit rotates it on every refresh) if the current one is expired/near.
export async function getValidAccessToken(
  admin: any,
  userId: string,
): Promise<{ accessToken: string; realmId: string } | null> {
  const { data: conn } = await admin
    .from("quickbooks_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn?.refresh_token || !conn?.realm_id) return null;

  const expiry = conn.expiry_date ? new Date(conn.expiry_date).getTime() : 0;
  if (conn.access_token && expiry > Date.now() + 60_000) {
    return { accessToken: conn.access_token, realmId: conn.realm_id };
  }

  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token,
  });
  if (!data.access_token) return null;

  const newExpiry = new Date(
    Date.now() + (Number(data.expires_in) || 3600) * 1000,
  ).toISOString();
  await admin
    .from("quickbooks_connections")
    .update({
      access_token: data.access_token,
      // Intuit returns a fresh refresh_token on every refresh — store it or the
      // connection dies when the old one expires.
      refresh_token: data.refresh_token || conn.refresh_token,
      expiry_date: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { accessToken: data.access_token, realmId: conn.realm_id };
}

async function qboRequest(
  accessToken: string,
  realmId: string,
  path: string,
  init: { method?: string; body?: any } = {},
) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${apiBase()}/v3/company/${realmId}/${path}${sep}minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.Fault?.Error?.[0]?.Message ||
      json?.Fault?.Error?.[0]?.Detail ||
      `QuickBooks API error (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

function qEscape(v: string) {
  return String(v || "").replace(/'/g, "\\'");
}

async function qboQuery(accessToken: string, realmId: string, query: string) {
  const data = await qboRequest(
    accessToken,
    realmId,
    `query?query=${encodeURIComponent(query)}`,
  );
  return data?.QueryResponse || {};
}

// A line item needs an ItemRef. Find any Service item; if none exists, create
// one against the first Income account so a fresh QuickBooks file still works.
async function getDefaultItemRef(accessToken: string, realmId: string) {
  const existing = await qboQuery(
    accessToken,
    realmId,
    "SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 1",
  );
  const item = existing?.Item?.[0];
  if (item?.Id) return { value: item.Id, name: item.Name };

  const accounts = await qboQuery(
    accessToken,
    realmId,
    "SELECT Id, Name FROM Account WHERE AccountType = 'Income' MAXRESULTS 1",
  );
  const income = accounts?.Account?.[0];
  if (!income?.Id) {
    throw new Error(
      "No income account found in QuickBooks to attach a service item to.",
    );
  }

  const created = await qboRequest(accessToken, realmId, "item", {
    method: "POST",
    body: {
      Name: "Home Inspection",
      Type: "Service",
      IncomeAccountRef: { value: income.Id },
    },
  });
  const newItem = created?.Item;
  return { value: newItem.Id, name: newItem.Name };
}

async function findOrCreateCustomer(
  accessToken: string,
  realmId: string,
  opts: { displayName: string; email?: string | null },
) {
  const name = opts.displayName.slice(0, 100);
  const found = await qboQuery(
    accessToken,
    realmId,
    `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${qEscape(name)}' MAXRESULTS 1`,
  );
  const existing = found?.Customer?.[0];
  if (existing?.Id) return existing.Id as string;

  const body: any = { DisplayName: name };
  if (opts.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.email)) {
    body.PrimaryEmailAddr = { Address: opts.email };
  }
  const created = await qboRequest(accessToken, realmId, "customer", {
    method: "POST",
    body,
  });
  return created?.Customer?.Id as string;
}

function inspectionAmount(insp: any): number {
  const n = (v: any) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  return (
    n(insp.invoice_amount) ||
    n(insp.total_price) ||
    n(insp.total) ||
    n(insp.price) ||
    n(insp.inspection_price) ||
    n(insp.inspection_fee) ||
    0
  );
}

// Create (or update) a QuickBooks Invoice for one inspection. Idempotent via
// the quickbooks_sync mapping. Returns the invoice id, or throws.
export async function syncInspectionToQuickBooks(
  admin: any,
  userId: string,
  inspectionId: string | number,
): Promise<{ invoiceId: string; amount: number } | null> {
  const auth = await getValidAccessToken(admin, userId);
  if (!auth) return null;
  const { accessToken, realmId } = auth;

  const { data: insp } = await admin
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!insp) return null;

  const amount = inspectionAmount(insp);
  if (amount <= 0) return null; // nothing to bill

  const address =
    insp.property_address || insp.address || `Inspection #${insp.id}`;
  const displayName =
    (insp.client_name && String(insp.client_name).trim()) ||
    `FLOW Client — ${address}`.slice(0, 100);
  const email = insp.client_email || insp.email || null;

  const customerId = await findOrCreateCustomer(accessToken, realmId, {
    displayName,
    email,
  });
  const itemRef = await getDefaultItemRef(accessToken, realmId);

  const paid =
    String(insp.payment_status || "").toLowerCase() === "paid" ||
    String(insp.payment_status || "").toLowerCase() === "waived";

  const line = {
    DetailType: "SalesItemLineDetail",
    Amount: amount,
    Description: `Home Inspection — ${address}${insp.inspection_date ? ` (${String(insp.inspection_date).slice(0, 10)})` : ""}`,
    SalesItemLineDetail: {
      ItemRef: { value: itemRef.value, name: itemRef.name },
    },
  };

  const invoiceBody: any = {
    CustomerRef: { value: customerId },
    Line: [line],
    PrivateNote: `FLOW inspection #${insp.id}${paid ? " — marked Paid in FLOW" : ""}. ${siteUrl()}/reports/${insp.id}`,
  };
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    invoiceBody.BillEmail = { Address: email };
  }

  // Update the existing invoice if we already synced this inspection.
  const { data: existing } = await admin
    .from("quickbooks_sync")
    .select("qb_invoice_id, qb_sync_token")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  let invoiceId: string;
  if (existing?.qb_invoice_id) {
    const updated = await qboRequest(accessToken, realmId, "invoice", {
      method: "POST",
      body: {
        ...invoiceBody,
        Id: existing.qb_invoice_id,
        SyncToken: existing.qb_sync_token || "0",
        sparse: false,
      },
    });
    invoiceId = updated?.Invoice?.Id;
    await admin
      .from("quickbooks_sync")
      .update({
        qb_customer_id: customerId,
        qb_invoice_id: invoiceId,
        qb_sync_token: updated?.Invoice?.SyncToken || "0",
        amount,
        updated_at: new Date().toISOString(),
      })
      .eq("inspection_id", inspectionId);
  } else {
    const created = await qboRequest(accessToken, realmId, "invoice", {
      method: "POST",
      body: invoiceBody,
    });
    invoiceId = created?.Invoice?.Id;
    await admin.from("quickbooks_sync").upsert(
      {
        inspection_id: inspectionId,
        user_id: userId,
        qb_customer_id: customerId,
        qb_invoice_id: invoiceId,
        qb_sync_token: created?.Invoice?.SyncToken || "0",
        amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "inspection_id" },
    );
  }

  return { invoiceId, amount };
}

// Push the inspector's billable inspections (amount > 0) that aren't synced yet
// to QuickBooks as invoices. Returns how many synced. Best-effort per item.
export async function syncBillableInspectionsToQuickBooks(
  admin: any,
  userId: string,
  limit = 50,
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const auth = await getValidAccessToken(admin, userId);
  if (!auth) return { synced: 0, skipped: 0, errors: ["Not connected."] };

  const { data: inspections } = await admin
    .from("inspections")
    .select("id")
    .eq("inspector_id", userId)
    .order("inspection_date", { ascending: false })
    .limit(300);

  const { data: alreadySynced } = await admin
    .from("quickbooks_sync")
    .select("inspection_id")
    .eq("user_id", userId);
  const syncedSet = new Set(
    (alreadySynced || []).map((r: any) => String(r.inspection_id)),
  );

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of inspections || []) {
    if (syncedSet.has(String(row.id))) continue;
    if (synced >= limit) break;
    try {
      const result = await syncInspectionToQuickBooks(admin, userId, row.id);
      if (result) synced += 1;
      else skipped += 1;
    } catch (err: any) {
      errors.push(`#${row.id}: ${err?.message || "sync failed"}`);
    }
  }
  return { synced, skipped, errors: errors.slice(0, 5) };
}

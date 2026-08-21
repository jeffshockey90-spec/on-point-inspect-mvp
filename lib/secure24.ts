import crypto from "crypto";

// Secure 24 CRM "lead-create" integration.
//
// This is an OPT-IN home-security referral: an inspector turns it on for their
// clients, and a client viewing their report can choose to have Secure 24 reach
// out. Nothing is ever sent without an explicit client action -- see the opt-in
// route for the consent + gating logic. This file only knows how to sign and
// POST a single lead.
//
// Signature (from their API doc / PHP sample):
//   md5( gmdate('Y-m-d H:i') + jsonBody + SHARED_SECRET )  -> hex, in a
//   "Signature" HTTP header. APIKey + Method travel INSIDE the JSON body.
// Secrets live only in server env (Vercel); never ship them to the browser.

export type Secure24LeadFields = {
  FirstName: string;
  LastName: string;
  Address: string;
  City: string;
  State: string;
  Zip: string;
  Phone: string;
  Email: string;
  Notes?: string;
  InspectionDate?: string; // YYYY-mm-dd
  ClosingDate?: string; // YYYY-mm-dd
  PolicyQuoteDate?: string; // YYYY-mm-dd
  AgentName?: string;
  AgentAddress?: string;
  AgentPhone?: string;
  AgentEmail?: string;
  ReferenceNum?: string;
  FranchiseeID?: string;
};

export type Secure24Result = {
  ok: boolean;
  resultCode: number | null;
  resultMessage: string;
  leadToken?: string;
  error?: string;
};

export function isSecure24Configured() {
  return Boolean(
    process.env.SECURE24_API_URL &&
      process.env.SECURE24_API_KEY &&
      process.env.SECURE24_SHARED_SECRET,
  );
}

// GMT timestamp 'YYYY-mm-dd HH:ii' (24-hour, leading zeros, minute precision)
// exactly matching the server's signature window.
function gmtStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

// Trim + drop empty optional fields so we never sign/send blank keys.
function clean(fields: Secure24LeadFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
    if (s) out[k] = s;
  }
  return out;
}

export async function submitSecure24Lead(
  fields: Secure24LeadFields,
): Promise<Secure24Result> {
  const url = process.env.SECURE24_API_URL;
  const apiKey = process.env.SECURE24_API_KEY;
  const secret = process.env.SECURE24_SHARED_SECRET;

  if (!url || !apiKey || !secret) {
    return {
      ok: false,
      resultCode: null,
      resultMessage: "",
      error: "Secure 24 is not configured (missing SECURE24_API_URL / _API_KEY / _SHARED_SECRET).",
    };
  }

  // APIKey + Method first, then the lead fields, in one flat JSON object.
  const payload = { APIKey: apiKey, Method: "lead-create", ...clean(fields) };
  const body = JSON.stringify(payload);

  // Sign the exact bytes we send: md5(gmtDate + body + sharedSecret) as hex.
  const signature = crypto
    .createHash("md5")
    .update(gmtStamp() + body + secret, "utf8")
    .digest("hex");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Signature: signature,
      },
      body,
      // Never let a slow partner API hang a report page.
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    let obj: any = null;
    try {
      obj = JSON.parse(text);
    } catch {
      /* fall through to bad-response handling */
    }

    if (!obj || typeof obj !== "object") {
      return {
        ok: false,
        resultCode: null,
        resultMessage: "",
        error: `Unexpected response from Secure 24 (HTTP ${res.status}): ${text.slice(0, 200)}`,
      };
    }

    const code = Number(obj.ResultCode);
    const ok = Number.isFinite(code) && code >= 200 && code <= 299;
    return {
      ok,
      resultCode: Number.isFinite(code) ? code : null,
      resultMessage: String(obj.ResultMessage || ""),
      leadToken: obj.LeadToken ? String(obj.LeadToken) : undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      resultCode: null,
      resultMessage: "",
      error: e?.name === "TimeoutError" ? "Secure 24 request timed out." : e?.message || "Request failed.",
    };
  }
}

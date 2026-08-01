// Twilio SMS layer. Uses the Twilio REST API directly (no SDK dependency).
// Everything degrades gracefully when the account isn't configured yet, so the
// app is safe to ship before credentials are plugged in.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM;
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

export function isSmsConfigured() {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && (FROM_NUMBER || MESSAGING_SERVICE_SID));
}

export function getSmsFromLabel() {
  return MESSAGING_SERVICE_SID
    ? "Messaging Service"
    : FROM_NUMBER || "Not set";
}

// Normalize to E.164 (+1XXXXXXXXXX for US). Returns null if it can't.
export function normalizePhone(raw: unknown): string | null {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function authHeader() {
  return `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`;
}

export type SendSmsResult = {
  ok: boolean;
  sid?: string;
  error?: string;
  skipped?: boolean;
  to?: string;
};

export async function sendSms({
  to,
  body,
}: {
  to: unknown;
  body: string;
}): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    return { ok: false, skipped: true, error: "SMS is not configured." };
  }

  const phone = normalizePhone(to);
  if (!phone) {
    return { ok: false, error: "Invalid or missing phone number." };
  }

  const params = new URLSearchParams();
  params.set("To", phone);
  if (MESSAGING_SERVICE_SID) params.set("MessagingServiceSid", MESSAGING_SERVICE_SID);
  else params.set("From", FROM_NUMBER!);
  params.set("Body", String(body || "").slice(0, 1500));

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        to: phone,
        error: data?.message || `Twilio error ${res.status}.`,
      };
    }

    return { ok: true, sid: data?.sid, to: phone };
  } catch (error: any) {
    return { ok: false, to: phone, error: error?.message || "SMS send failed." };
  }
}

export type TwilioBalance = {
  configured: boolean;
  balance?: number;
  currency?: string;
  lowBalance?: boolean;
  threshold?: number;
  error?: string;
};

// The threshold below which we warn the owner to top up.
export function getLowBalanceThreshold() {
  const raw = Number(process.env.SMS_LOW_BALANCE_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

export async function getTwilioBalance(): Promise<TwilioBalance> {
  if (!ACCOUNT_SID || !AUTH_TOKEN) return { configured: false };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Balance.json`,
      { headers: { Authorization: authHeader() } }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { configured: true, error: data?.message || `Twilio error ${res.status}.` };
    }

    const balance = Number(data?.balance);
    const threshold = getLowBalanceThreshold();

    return {
      configured: true,
      balance: Number.isFinite(balance) ? balance : undefined,
      currency: data?.currency || "USD",
      threshold,
      lowBalance: Number.isFinite(balance) ? balance < threshold : undefined,
    };
  } catch (error: any) {
    return { configured: true, error: error?.message || "Balance check failed." };
  }
}

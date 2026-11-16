// Saved quotes: an inspector's quote stored server-side with an unguessable
// token, sent to the client as a booking link (/book?quote=<token>). The quote
// row is the source of truth for the quoted price — the client can't change it
// by editing the link, and confirming the booking invoices this total.

import { randomBytes } from "crypto";

export const QUOTE_VALID_DAYS = 30;

type Db = { from: (t: string) => any };

export function newQuoteToken(): string {
  return randomBytes(18).toString("base64url");
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

export type SavedQuoteInput = {
  clientName?: string;
  clientEmail?: string;
  propertyAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  squareFeet?: number | null;
  serviceIds?: string[];
  lineItems?: Array<{ id: string; name: string; fee: number; units?: number }>;
  travelFee?: number;
  discount?: number;
  total?: number;
};

/** Validate/clean what the Quotes page sends. Returns an error string or the row fields. */
export function normalizeQuoteInput(input: SavedQuoteInput, now = new Date()) {
  const lineItems = (Array.isArray(input.lineItems) ? input.lineItems : [])
    .slice(0, 30)
    .map((item) => ({
      id: text(item?.id, 60),
      name: text(item?.name, 120),
      fee: Math.max(0, Math.round(num(item?.fee) * 100) / 100),
      units: Math.max(0, Math.floor(num(item?.units))),
    }))
    .filter((item) => item.id && item.name);
  if (!lineItems.length) return { error: "Pick at least one service before saving the quote." } as const;

  const total = Math.max(0, Math.round(num(input.total) * 100) / 100);
  if (total <= 0) return { error: "The quote total must be more than $0." } as const;

  const email = text(input.clientEmail, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That client email doesn't look right." } as const;
  }

  const sqft = Math.floor(num(input.squareFeet));
  return {
    row: {
      client_name: text(input.clientName, 200) || null,
      client_email: email || null,
      property_address: text(input.propertyAddress) || null,
      city: text(input.city, 120) || null,
      state: text(input.state, 20).toUpperCase() || null,
      zip: text(input.zip, 20) || null,
      square_feet: sqft > 0 ? sqft : null,
      service_ids: lineItems.map((item) => item.id),
      line_items: lineItems,
      travel_fee: Math.max(0, num(input.travelFee)),
      discount: Math.max(0, num(input.discount)),
      total,
      expires_at: new Date(now.getTime() + QUOTE_VALID_DAYS * 86400000).toISOString(),
    },
  } as const;
}

/** Booking-form service checkboxes that match a quote's built-in services. */
export function bookingServicesForQuote(serviceIds: unknown, lineItems: unknown): string[] {
  const ids = new Set((Array.isArray(serviceIds) ? serviceIds : []).map((id) => String(id)));
  const out: string[] = [];
  if (ids.has("home")) out.push("Buyer Home Inspection");
  if (ids.has("radon")) out.push("Radon Testing");
  if (ids.has("mold")) out.push("Mold Visual / Air Sampling");
  // Custom services carry over by name so the inspector sees them on the request.
  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    const id = String((item as any)?.id || "");
    const name = String((item as any)?.name || "").trim();
    if (name && !["home", "radon", "mold"].includes(id)) out.push(name);
  }
  return out.length ? out : ["Buyer Home Inspection"];
}

export function isQuoteOpen(quote: any, now = new Date()): boolean {
  if (!quote || quote.status !== "open") return false;
  if (quote.expires_at && new Date(quote.expires_at).getTime() < now.getTime()) return false;
  return true;
}

/** The open quote for a booking link token (service-role db), or null. */
export async function loadOpenQuote(db: Db, token: string) {
  const clean = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(clean)) return null;
  try {
    const { data } = await db.from("saved_quotes").select("*").eq("token", clean).maybeSingle();
    return isQuoteOpen(data) ? data : null;
  } catch {
    return null;
  }
}

/** The quote a booking request was made from (to invoice the quoted price). */
export async function findQuoteForBooking(db: Db, bookingRequestId: string | number) {
  try {
    const { data } = await db
      .from("saved_quotes")
      .select("id, total, line_items")
      .eq("booking_request_id", bookingRequestId)
      .limit(1);
    return (data || [])[0] || null;
  } catch {
    return null;
  }
}

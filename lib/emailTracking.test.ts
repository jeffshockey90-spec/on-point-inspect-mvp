import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signTrackingUrl, verifyTrackingParams } from "./emailTracking";

const now = Date.parse("2026-11-20T12:00:00Z");
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});
afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
});

const base = "https://app.example.com/api/email-click?inspection_id=157&recipient_type=client&recipient_email=Client%40Example.com&target=%2Fshare%2Fabc";

describe("email tracking signatures", () => {
  it("verifies a link FLOW signed", () => {
    const signed = new URL(signTrackingUrl(base, now));
    expect(verifyTrackingParams(signed.searchParams, now)).toBe(true);
  });

  it("is case-insensitive on the recipient email", () => {
    const signed = new URL(signTrackingUrl(base, now));
    signed.searchParams.set("recipient_email", "client@example.com");
    expect(verifyTrackingParams(signed.searchParams, now)).toBe(true);
  });

  it("rejects unsigned, tampered, or retargeted links", () => {
    expect(verifyTrackingParams(new URL(base).searchParams, now)).toBe(false);
    const signed = new URL(signTrackingUrl(base, now));
    signed.searchParams.set("inspection_id", "158");
    expect(verifyTrackingParams(signed.searchParams, now)).toBe(false);
    const other = new URL(signTrackingUrl(base, now));
    other.searchParams.set("recipient_email", "someone@else.com");
    expect(verifyTrackingParams(other.searchParams, now)).toBe(false);
  });

  it("keeps the redirect target and leaves non-inspection links alone", () => {
    expect(new URL(signTrackingUrl(base, now)).searchParams.get("target")).toBe("/share/abc");
    const owner = "https://app.example.com/api/email-open?owner_message_id=9";
    expect(signTrackingUrl(owner, now)).toBe(owner);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signInternal, verifyInternal } from "./internalSignature";

describe("internal signatures", () => {
  const prev = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });
  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = prev;
  });

  it("accepts its own signature for the same purpose and subject", () => {
    const { exp, sig } = signInternal("posters", "123");
    expect(verifyInternal("posters", "123", exp, sig)).toBe(true);
  });

  it("rejects another inspection, another purpose, a tampered or expired signature", () => {
    const now = Date.now();
    const { exp, sig } = signInternal("posters", "123", 60, now);
    expect(verifyInternal("posters", "124", exp, sig, now)).toBe(false);
    expect(verifyInternal("other", "123", exp, sig, now)).toBe(false);
    expect(verifyInternal("posters", "123", exp, sig + "x", now)).toBe(false);
    expect(verifyInternal("posters", "123", exp, sig, now + 61_000)).toBe(false);
  });
});

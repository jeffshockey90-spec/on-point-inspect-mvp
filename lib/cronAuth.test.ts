import { describe, it, expect, afterEach } from "vitest";
import { isCronAuthorized } from "./cronAuth";

const req = (headers: Record<string, string>) => new Request("https://x.test/api/cron/a", { headers });

describe("isCronAuthorized", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("requires the secret when it is set", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(req({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isCronAuthorized(req({ "x-cron-secret": "s3cret" }))).toBe(true);
    expect(isCronAuthorized(req({ "user-agent": "vercel-cron/1.0" }))).toBe(false);
    expect(isCronAuthorized(req({}))).toBe(false);
  });

  it("without a secret, only accepts Vercel's scheduler (no longer anyone)", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req({ "user-agent": "vercel-cron/1.0" }))).toBe(true);
    expect(isCronAuthorized(req({ "user-agent": "curl/8.0" }))).toBe(false);
    expect(isCronAuthorized(req({}))).toBe(false);
  });
});

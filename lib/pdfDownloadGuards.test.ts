import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Regression tripwires for the two subtle config bugs that silently broke report
// PDF downloads (see the report-pdf-download notes). These only READ source files
// and assert — they never run Chromium or touch the download flow.

const ROOT = process.cwd();

const PDF_ROUTES = [
  "app/api/realtor-report-download/[id]/route.ts",
  "app/api/repair-request-addendum/[token]/route.ts",
];

function read(relPath: string) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

describe("PDF routes launch Chromium in headless-shell mode", () => {
  // @sparticuz/chromium ships the headless-SHELL binary. Launching it with the
  // NEW headless engine (`headless: true`) renders the page but makes the print
  // step throw "Protocol error (Page.printToPDF): Printing failed". Serverless
  // MUST use `chromium.headless`.
  for (const route of PDF_ROUTES) {
    it(`${route} uses chromium.headless on serverless`, () => {
      const src = read(route);
      expect(
        src.includes("(chromium as any).headless") ||
          src.includes("chromium.headless"),
      ).toBe(true);
    });
  }
});

describe("vercel.json binds memory to the PDF functions", () => {
  const config = JSON.parse(read("vercel.json"));
  const functions: Record<string, { memory?: number; maxDuration?: number }> =
    config.functions || {};
  const keys = Object.keys(functions);

  it("has a functions block", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("uses /** globs, never the literal [id]/[token] (a glob char-class matches nothing)", () => {
    for (const key of keys) {
      expect(key).not.toContain("[");
    }
  });

  for (const dir of [
    "app/api/realtor-report-download/**",
    "app/api/repair-request-addendum/**",
  ]) {
    it(`configures memory for ${dir}`, () => {
      const fn = functions[dir];
      expect(fn, `missing functions["${dir}"]`).toBeTruthy();
      // Chromium PDF rendering OOMs at the default 1GB on photo-heavy reports.
      expect(fn.memory).toBeGreaterThanOrEqual(2048);
    });
  }
});

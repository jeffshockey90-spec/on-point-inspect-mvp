import { describe, expect, it } from "vitest";
import { brandEmailHtml, safeBrandColor, safeLogoUrl } from "./emailBrand";

const brand = { name: "Acme Inspections", logoUrl: "https://cdn.example.com/logo.png", brandColor: "#123abc" };

describe("brandEmailHtml", () => {
  it("adds the logo and brand color once", () => {
    const out = brandEmailHtml("<p>Hello</p>", brand);
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
    expect(out).toContain("#123abc");
    expect(out.endsWith("<p>Hello</p>")).toBe(true);
    expect(brandEmailHtml(out, brand)).toBe(out);
  });

  it("goes inside <body> for full documents", () => {
    const out = brandEmailHtml('<html><body style="x"><p>Hi</p></body></html>', brand);
    expect(out.indexOf("data-flow-brand-header")).toBeGreaterThan(out.indexOf("<body"));
  });

  it("shows only the brand-color bar without a logo, and escapes the alt text", () => {
    const out = brandEmailHtml("<p>x</p>", { name: "A <b> Co", logoUrl: null, brandColor: "#fff" });
    expect(out).toContain("#fff");
    expect(out).not.toContain("<img");
    const withLogo = brandEmailHtml("<p>x</p>", { ...brand, name: 'A "<b>" Co' });
    expect(withLogo).toContain('alt="A &quot;&lt;b&gt;&quot; Co"');
  });

  it("leaves empty html alone", () => {
    expect(brandEmailHtml("", brand)).toBe("");
  });
});

describe("validation", () => {
  it("only allows hex colors and https logos", () => {
    expect(safeBrandColor("red;background:url(x)")).toBe("#14b8a6");
    expect(safeBrandColor("#ABC")).toBe("#ABC");
    expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(safeLogoUrl("http://insecure.example.com/a.png")).toBeNull();
    expect(safeLogoUrl("https://ok.example.com/a.png")).toBe("https://ok.example.com/a.png");
  });
});

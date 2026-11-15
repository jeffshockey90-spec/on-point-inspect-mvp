import { describe, it, expect } from "vitest";
import { severityTagStyle, DEFAULT_SEVERITY_CONFIG } from "./severityConfig";

describe("severityTagStyle", () => {
  it("fills with the level's color", () => {
    expect(severityTagStyle(DEFAULT_SEVERITY_CONFIG, "Safety Concern").background).toBe("#dc2626");
  });

  it("uses white text on dark colors and black text on light ones", () => {
    expect(severityTagStyle(DEFAULT_SEVERITY_CONFIG, "Safety Concern").color).toBe("#ffffff");
    expect(severityTagStyle(DEFAULT_SEVERITY_CONFIG, "Informational").color).toBe("#ffffff");
    const light = { levels: [{ id: "x", label: "Watch", color: "#fde047", critical: false }] };
    expect(severityTagStyle(light, "Watch").color).toBe("#000000");
  });
});

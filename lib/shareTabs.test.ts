import { describe, it, expect } from "vitest";
import { tabForHash, resolveInitialTab } from "./shareTabs";

describe("shared report tabs", () => {
  it("maps link hashes to tabs", () => {
    expect(tabForHash("#finding-123")).toBe("full");
    expect(tabForHash("#section-roof")).toBe("full");
    expect(tabForHash("#priority-repairs")).toBe("priority");
    expect(tabForHash("#client-summary-safety")).toBe("summary");
    expect(tabForHash("#nothing")).toBeNull();
    expect(tabForHash("")).toBeNull();
  });
  it("opens Full Report when a clean report has no Summary panel", () => {
    expect(resolveInitialTab("summary", false)).toBe("full");
    expect(resolveInitialTab("summary", true)).toBe("summary");
    expect(resolveInitialTab("priority", false)).toBe("priority");
  });
});

import { describe, expect, it } from "vitest";
import { allowRecovery, MAX_RECOVERIES_PER_WINDOW, RECOVERY_WINDOW_MS } from "./cameraRecovery";

describe("allowRecovery", () => {
  it("allows a few quick recoveries, then stops so the camera can't loop", () => {
    let attempts: number[] = [];
    for (let i = 0; i < MAX_RECOVERIES_PER_WINDOW; i++) {
      const gate = allowRecovery(attempts, 1000 + i);
      expect(gate.allowed).toBe(true);
      attempts = gate.attempts;
    }
    expect(allowRecovery(attempts, 2000).allowed).toBe(false);
  });

  it("allows again once older attempts age out", () => {
    const old = [0, 1, 2];
    expect(allowRecovery(old, RECOVERY_WINDOW_MS + 10).allowed).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
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

import { withMediaTimeout, isStartInProgress, STALE_START_MS } from "./cameraRecovery";

describe("withMediaTimeout", () => {
  it("resolves when the camera answers in time", async () => {
    const stream = { getTracks: () => [] };
    await expect(withMediaTimeout(Promise.resolve(stream), 50)).resolves.toBe(stream);
  });

  it("rejects a hung request and stops the stream if it arrives late", async () => {
    const stop = vi.fn();
    let answer: (v: any) => void = () => {};
    const late = new Promise<any>((r) => (answer = r));
    await expect(withMediaTimeout(late, 10)).rejects.toThrow(/too long/);
    answer({ getTracks: () => [{ stop }] });
    await new Promise((r) => setTimeout(r, 0));
    expect(stop).toHaveBeenCalled();
  });

  it("passes through a real error", async () => {
    await expect(withMediaTimeout(Promise.reject(new Error("denied")), 50)).rejects.toThrow("denied");
  });
});

describe("isStartInProgress", () => {
  it("is busy only for a recent start", () => {
    expect(isStartInProgress(0, 1000)).toBe(false);
    expect(isStartInProgress(1000, 1500)).toBe(true);
    expect(isStartInProgress(1000, 1000 + STALE_START_MS)).toBe(false);
  });
});

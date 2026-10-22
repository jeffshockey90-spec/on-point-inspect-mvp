import { describe, expect, it } from "vitest";
import { registerToast, toastStackIndexOf, unregisterToast } from "./toastStack";

describe("toastStack registry", () => {
  it("assigns each newly-registered toast the next stack slot", () => {
    const first = registerToast();
    const second = registerToast();
    const third = registerToast();

    expect(toastStackIndexOf(first)).toBe(0);
    expect(toastStackIndexOf(second)).toBe(1);
    expect(toastStackIndexOf(third)).toBe(2);

    unregisterToast(first);
    unregisterToast(second);
    unregisterToast(third);
  });

  it("shifts remaining toasts down when an earlier one clears", () => {
    const first = registerToast();
    const second = registerToast();

    unregisterToast(first);

    // The second toast (still showing) moves into the now-vacant bottom slot
    // instead of leaving a gap, so a later toast doesn't stack on empty space.
    expect(toastStackIndexOf(second)).toBe(0);

    unregisterToast(second);
  });

  it("returns -1 for a toast that isn't registered (already cleared)", () => {
    const id = registerToast();
    unregisterToast(id);

    expect(toastStackIndexOf(id)).toBe(-1);
  });
});

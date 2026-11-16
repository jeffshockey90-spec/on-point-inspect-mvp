import { describe, it, expect } from "vitest";
import { throwIfAnyError } from "./supabaseResults";

describe("throwIfAnyError", () => {
  it("passes when every result is clean", () => {
    expect(() => throwIfAnyError([{ error: null }, undefined, { error: undefined }])).not.toThrow();
  });
  it("throws the first error so the caller's catch runs", () => {
    expect(() => throwIfAnyError([{ error: null }, { error: { message: "RLS denied" } }])).toThrow("RLS denied");
  });
});

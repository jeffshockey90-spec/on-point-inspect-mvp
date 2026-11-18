import { describe, expect, it } from "vitest";
import { splitFieldProps } from "./stableFieldProps";

describe("splitFieldProps", () => {
  it("separates handlers from attributes", () => {
    const onChange = () => {};
    const { handlers, attrs } = splitFieldProps({ onChange, className: "x", placeholder: "p", rows: undefined });
    expect(Object.keys(handlers)).toEqual(["onChange"]);
    expect(attrs).toEqual({ className: "x", placeholder: "p" });
  });

  it("keeps the same key when only handlers change (so the field is not rewritten)", () => {
    const a = splitFieldProps({ onChange: () => 1, className: "x" }).attrsKey;
    const b = splitFieldProps({ onChange: () => 2, className: "x" }).attrsKey;
    expect(a).toBe(b);
  });

  it("changes the key when an attribute really changes", () => {
    const a = splitFieldProps({ className: "x", disabled: false }).attrsKey;
    const b = splitFieldProps({ disabled: true, className: "x" }).attrsKey;
    expect(a).not.toBe(b);
  });
});

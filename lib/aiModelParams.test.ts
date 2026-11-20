import { afterEach, describe, expect, it } from "vitest";
import { findingsModel, supportsTemperature, temperatureParam } from "./aiModelParams";

describe("model params", () => {
  afterEach(() => {
    delete process.env.OPENAI_FINDINGS_MODEL;
  });
  it("drops temperature for newer models", () => {
    expect(supportsTemperature("gpt-4o")).toBe(true);
    expect(supportsTemperature("gpt-4o-mini")).toBe(true);
    expect(supportsTemperature("gpt-6.2-sol")).toBe(false);
    expect(supportsTemperature("o4-mini")).toBe(false);
    expect(temperatureParam("gpt-6.2-sol", 0.2)).toEqual({});
    expect(temperatureParam("gpt-4o", 0.2)).toEqual({ temperature: 0.2 });
  });
  it("uses OPENAI_FINDINGS_MODEL when set", () => {
    expect(findingsModel("gpt-4o")).toBe("gpt-4o");
    process.env.OPENAI_FINDINGS_MODEL = "gpt-6.2-sol";
    expect(findingsModel("gpt-4o")).toBe("gpt-6.2-sol");
  });
});

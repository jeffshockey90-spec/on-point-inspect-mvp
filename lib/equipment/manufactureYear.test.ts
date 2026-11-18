import { describe, expect, it } from "vitest";
import { pickManufactureYear } from "./manufactureYear";

describe("pickManufactureYear", () => {
  it("trusts a strict brand serial decode over the AI's year (Goodman 2005388630 = 2020)", () => {
    expect(pickManufactureYear({ strictSerialYear: 2020, aiYear: 2005, fallbackSerialYear: 2020 })).toBe(2020);
  });
  it("uses the AI's year when no strict decode exists", () => {
    expect(pickManufactureYear({ strictSerialYear: null, aiYear: 2012, fallbackSerialYear: 2005 })).toBe(2012);
  });
  it("falls back to a loose serial guess last", () => {
    expect(pickManufactureYear({ strictSerialYear: null, aiYear: null, fallbackSerialYear: 2015 })).toBe(2015);
    expect(pickManufactureYear({ strictSerialYear: null, aiYear: null, fallbackSerialYear: null })).toBe(null);
  });
});

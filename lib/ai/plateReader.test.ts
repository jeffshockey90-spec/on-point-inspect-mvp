import { describe, expect, it } from "vitest";
import { acceptsTemperature, mergePlateRead, parsePlateRead, plateYear } from "./plateReader";

describe("data plate read", () => {
  it("parses and cleans the read, dropping unknowns", () => {
    const plate = parsePlateRead(
      JSON.stringify({ brand: "Goodman", model: "ARUF37C14AD", serial: " 2005388630 ", manufacture_date: "Unknown", refrigerant: "R-410A" }),
    );
    expect(plate).toMatchObject({ brand: "Goodman", model: "ARUF37C14AD", serial: "2005388630", manufacture_date: "", refrigerant: "R-410A" });
    expect(parsePlateRead("not json").brand).toBe("");
  });

  it("only takes a year the plate prints", () => {
    expect(plateYear(parsePlateRead(JSON.stringify({ manufacture_date: "MFG 05/2020" })))).toBe(2020);
    expect(plateYear(parsePlateRead(JSON.stringify({ manufacture_date: "" })))).toBeNull();
  });

  it("overrides identification and fixes the brand in the written text (the Alumacool misread)", () => {
    const main = {
      manufacturer: "Alumacool Manufacturing Company, L.P.",
      model: "ARUF37C14AO",
      serial: "2005388630",
      manufactureYear: "2005",
      clientSummary: "Alumacool Manufacturing Company, L.P. air handler.",
      severity: "Monitor",
    };
    const merged = mergePlateRead(main, parsePlateRead(JSON.stringify({ brand: "Goodman", model: "ARUF37C14AD", serial: "2005388630" })));
    expect(merged.manufacturer).toBe("Goodman");
    expect(merged.model).toBe("ARUF37C14AD");
    expect(merged.manufactureYear).toBe("2005"); // no printed date -> serial decoder decides later
    expect(merged.clientSummary).toBe("Goodman air handler.");
    expect(merged.severity).toBe("Monitor");
  });

  it("leaves the analysis alone when the read found nothing", () => {
    const main = { manufacturer: "Rheem", model: "X" };
    expect(mergePlateRead(main, parsePlateRead("{}"))).toBe(main);
    expect(mergePlateRead(main, null)).toBe(main);
  });

  it("skips temperature for reasoning models", () => {
    expect(acceptsTemperature("gpt-4o")).toBe(true);
    expect(acceptsTemperature("gpt-5.2")).toBe(false);
    expect(acceptsTemperature("o4-mini")).toBe(false);
    expect(acceptsTemperature("gpt-6.2-astra")).toBe(false);
  });
});

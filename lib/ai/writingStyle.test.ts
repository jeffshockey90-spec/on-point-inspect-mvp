import { describe, it, expect } from "vitest";
import {
  buildWritingStyleInstructions,
  DEFAULT_AI_WRITING_CONFIG,
} from "./writingStyle";

describe("buildWritingStyleInstructions — standards framing", () => {
  // Regression: the old "frame recommendations in language consistent with the
  // SOP" wording made the model stamp "In accordance with the InterNACHI
  // Standards of Practice, recommend evaluation..." into client-facing text
  // (noticed after combining defects). The block must tell the model to write
  // plain advice and NOT to cite the Standards of Practice to the client.
  it("tells the model NOT to name-drop the Standards of Practice in finding text", () => {
    const block = buildWritingStyleInstructions(DEFAULT_AI_WRITING_CONFIG);
    expect(block).toMatch(/do not cite, quote, or name the standards of practice/i);
    expect(block).toMatch(/In accordance with the \.\.\. Standards of Practice/i);
  });

  it("still carries the SOP standard so recommendations call for a qualified professional", () => {
    const block = buildWritingStyleInstructions(DEFAULT_AI_WRITING_CONFIG);
    expect(block).toContain("InterNACHI Standards of Practice");
    expect(block).toMatch(/qualified professional/i);
  });

  it("honors the ASHI standard when configured", () => {
    const block = buildWritingStyleInstructions({
      ...DEFAULT_AI_WRITING_CONFIG,
      sopStandard: "ASHI",
    });
    expect(block).toContain("ASHI Standards of Practice");
  });
});

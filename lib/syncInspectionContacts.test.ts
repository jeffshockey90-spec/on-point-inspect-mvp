import { describe, expect, it } from "vitest";
import {
  cleanContactValue,
  pickPrimaryContacts,
  buildInspectionContactPatch,
} from "./syncInspectionContacts";

describe("cleanContactValue", () => {
  it("strips iOS directional / zero-width formatting characters", () => {
    // The real Burg Holdings number came in wrapped in U+202A ... U+202C.
    expect(cleanContactValue("‪3013051982‬")).toBe("3013051982");
    expect(cleanContactValue("​﻿Jane Doe ")).toBe("Jane Doe");
  });
  it("collapses non-breaking spaces and trims", () => {
    expect(cleanContactValue("  (301) 305-1982  ")).toBe("(301) 305-1982");
  });
  it("handles null/undefined", () => {
    expect(cleanContactValue(null)).toBe("");
    expect(cleanContactValue(undefined)).toBe("");
  });
});

describe("pickPrimaryContacts", () => {
  it("prefers the exact 'client' role over a co-client, then creation order", () => {
    const { client } = pickPrimaryContacts([
      { role: "co-client", name: "Spouse", email: "s@x.com", created_at: "2026-01-01" },
      { role: "client", name: "Primary", email: "p@x.com", created_at: "2026-01-02" },
    ]);
    expect(client?.name).toBe("Primary");
  });

  it("falls back to earliest-created when roles tie", () => {
    const { client } = pickPrimaryContacts([
      { role: "client", name: "Second", email: "b@x.com", created_at: "2026-02-02" },
      { role: "client", name: "First", email: "a@x.com", created_at: "2026-02-01" },
    ]);
    expect(client?.name).toBe("First");
  });

  it("matches realtor and agent roles for the realtor slot", () => {
    expect(pickPrimaryContacts([{ role: "agent", name: "A", email: "a@x.com" }]).realtor?.name).toBe("A");
    expect(pickPrimaryContacts([{ role: "realtor", name: "R", email: "r@x.com" }]).realtor?.name).toBe("R");
  });

  it("returns null for a role with no contact", () => {
    const { client, realtor } = pickPrimaryContacts([{ role: "realtor", name: "R", email: "r@x.com" }]);
    expect(client).toBeNull();
    expect(realtor?.name).toBe("R");
  });
});

describe("buildInspectionContactPatch", () => {
  it("mirrors the primary client into client_* and cleans the phone", () => {
    const patch = buildInspectionContactPatch([
      { role: "client", name: "The Burg Holdings, LLC", email: "168boweryst@gmail.com", phone: "‪3013051982‬" },
    ]);
    expect(patch.client_name).toBe("The Burg Holdings, LLC");
    expect(patch.client_email).toBe("168boweryst@gmail.com");
    expect(patch.client_phone).toBe("3013051982");
    // No realtor contact -> never touch realtor fields.
    expect("realtor_email" in patch).toBe(false);
    expect("agent_phone" in patch).toBe(false);
  });

  it("mirrors a realtor into realtor_* AND the agent_* aliases", () => {
    const patch = buildInspectionContactPatch([
      { role: "realtor", name: "Misty", email: "misty@exp.com", phone: "2402223333" },
    ]);
    expect(patch.realtor_email).toBe("misty@exp.com");
    expect(patch.realtor_phone).toBe("2402223333");
    expect(patch.agent_email).toBe("misty@exp.com");
    expect(patch.agent_phone).toBe("2402223333");
    expect("client_email" in patch).toBe(false);
  });

  it("empties to null rather than writing an empty string", () => {
    const patch = buildInspectionContactPatch([
      { role: "client", name: "X", email: "x@x.com", phone: "" },
    ]);
    expect(patch.client_phone).toBeNull();
  });

  it("returns an empty patch when there are no client/realtor contacts", () => {
    expect(buildInspectionContactPatch([{ role: "inspector", name: "Me", email: "me@x.com" }])).toEqual({});
    expect(buildInspectionContactPatch([])).toEqual({});
  });
});

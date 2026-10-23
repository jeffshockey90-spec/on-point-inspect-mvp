import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => createClientMock(...args),
}));

function chainable(result: { data: any; error: any }) {
  const eqCalls: Array<[string, any]> = [];
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: any) => {
      eqCalls.push([col, val]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return { builder, eqCalls };
}

describe("findingRetrieval", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("filters published findings by the inspector on the joined inspections row, not a column on findings", async () => {
    const findings = chainable({
      data: [
        {
          title: "Loose handrail",
          section: "Exterior",
          severity: "Safety",
          location: "Front porch",
          observation: "Handrail moves when grasped.",
          implication: "Fall risk.",
          recommendation: "Secure or replace.",
          created_at: "2026-01-01",
        },
      ],
      error: null,
    });
    const inspections = chainable({ data: { inspector_id: "inspector-123" }, error: null });

    createClientMock.mockReturnValue({
      from: vi.fn((table: string) => (table === "findings" ? findings.builder : inspections.builder)),
    });

    const { getInspectorFindingExamples } = await import("./findingRetrieval");

    const examples = await getInspectorFindingExamples({
      inspectionId: 42,
      section: "Exterior",
      subject: "handrail",
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].observation).toContain("Handrail moves");

    // The bug: filtering with `inspector_id` directly on `findings` 400s, because
    // that column doesn't exist on that table. The fix must filter through the
    // inner-joined `inspections` row instead.
    expect(findings.eqCalls).not.toContainEqual(["inspector_id", "inspector-123"]);
    expect(findings.eqCalls).toContainEqual(["inspections.inspector_id", "inspector-123"]);
  });

  it("resolves the inspector from the inspection record when no userId is given", async () => {
    const inspections = chainable({ data: { inspector_id: "inspector-999" }, error: null });
    createClientMock.mockReturnValue({
      from: vi.fn(() => inspections.builder),
    });

    const { resolveInspectorId } = await import("./findingRetrieval");

    const id = await resolveInspectorId({ inspectionId: 7 });
    expect(id).toBe("inspector-999");
    expect(inspections.eqCalls).toContainEqual(["id", 7]);
  });

  it("logs visibly instead of failing silently when the query errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const findings = chainable({ data: null, error: { message: "relation does not have column" } });
    const inspections = chainable({ data: { inspector_id: "inspector-1" }, error: null });

    createClientMock.mockReturnValue({
      from: vi.fn((table: string) => (table === "findings" ? findings.builder : inspections.builder)),
    });

    const { getInspectorFindingExamples } = await import("./findingRetrieval");

    const examples = await getInspectorFindingExamples({ inspectionId: 1 });

    expect(examples).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });
});

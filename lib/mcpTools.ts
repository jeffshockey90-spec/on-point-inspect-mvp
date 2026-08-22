import { resolveInspectionAccessFilter } from "./inspectionAccess";

// Tools exposed over MCP to an inspector's own AI client. Everything is scoped
// to the API key owner (resolveInspectionAccessFilter: their own inspections,
// or their whole company if they're the owner), so an AI assistant can never
// reach another company's data.

const INSPECTION_FIELDS =
  "id, property_address, city, state, zip, client_name, inspection_date, inspection_status, report_status, payment_status, published, created_at";
const FINDING_FIELDS =
  "id, inspection_id, title, section, severity, location, observation, implication, recommendation";

export const MCP_TOOLS = [
  {
    name: "list_inspections",
    description:
      "List the inspector's inspections, most recent first. Returns id, address, client, dates and status.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows (default 25, max 200)." },
        offset: { type: "number", description: "Rows to skip for paging." },
      },
    },
  },
  {
    name: "get_inspection",
    description: "Get a single inspection by its id.",
    inputSchema: {
      type: "object",
      properties: { inspection_id: { type: "number" } },
      required: ["inspection_id"],
    },
  },
  {
    name: "list_findings",
    description: "List the findings on an inspection (title, section, severity, observation, recommendation).",
    inputSchema: {
      type: "object",
      properties: { inspection_id: { type: "number" } },
      required: ["inspection_id"],
    },
  },
  {
    name: "update_finding",
    description:
      "Update the text of a finding. Only the provided fields change. Returns the updated finding.",
    inputSchema: {
      type: "object",
      properties: {
        finding_id: { type: "number" },
        title: { type: "string" },
        section: { type: "string" },
        severity: { type: "string" },
        location: { type: "string" },
        observation: { type: "string" },
        implication: { type: "string" },
        recommendation: { type: "string" },
      },
      required: ["finding_id"],
    },
  },
] as const;

// Is this inspection within the caller's access scope?
async function ownsInspection(admin: any, userId: string, inspectionId: number) {
  const filter = await resolveInspectionAccessFilter(admin, userId);
  const { data } = await admin
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq(filter.column, filter.value)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function callMcpTool(
  admin: any,
  userId: string,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  const filter = await resolveInspectionAccessFilter(admin, userId);

  if (name === "list_inspections") {
    const limit = Math.min(200, Math.max(1, Number(args?.limit) || 25));
    const offset = Math.max(0, Number(args?.offset) || 0);
    const { data, error } = await admin
      .from("inspections")
      .select(INSPECTION_FIELDS)
      .eq(filter.column, filter.value)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { inspections: data || [] };
  }

  if (name === "get_inspection") {
    const id = Number(args?.inspection_id);
    const { data, error } = await admin
      .from("inspections")
      .select(INSPECTION_FIELDS)
      .eq("id", id)
      .eq(filter.column, filter.value)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Inspection not found or not accessible.");
    return data;
  }

  if (name === "list_findings") {
    const id = Number(args?.inspection_id);
    if (!(await ownsInspection(admin, userId, id))) {
      throw new Error("Inspection not found or not accessible.");
    }
    const { data, error } = await admin
      .from("findings")
      .select(FINDING_FIELDS)
      .eq("inspection_id", id)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    return { findings: data || [] };
  }

  if (name === "update_finding") {
    const findingId = Number(args?.finding_id);
    const { data: finding } = await admin
      .from("findings")
      .select("id, inspection_id")
      .eq("id", findingId)
      .maybeSingle();
    if (!finding?.id) throw new Error("Finding not found.");
    if (!(await ownsInspection(admin, userId, Number(finding.inspection_id)))) {
      throw new Error("Finding not accessible.");
    }

    const patch: Record<string, any> = {};
    for (const key of ["title", "section", "severity", "location", "observation", "implication", "recommendation"]) {
      if (typeof args?.[key] === "string") patch[key] = args[key];
    }
    if (Object.keys(patch).length === 0) throw new Error("No fields to update.");

    const { data, error } = await admin
      .from("findings")
      .update(patch)
      .eq("id", findingId)
      .select(FINDING_FIELDS)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  throw new Error(`Unknown tool: ${name}`);
}

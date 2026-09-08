// =====================================================================
// ASK FLOW — the read-only back-office assistant's data layer.
//
// Exposes a small set of OpenAI tool (function) definitions plus their
// executors. EVERY executor scopes its query to what the asking user is
// allowed to see, via resolveInspectionAccessFilter / resolveTeamInspectorIds
// (owner -> whole company; inspector -> their own). The agent can never read
// another company's data because the scope is applied server-side here, not
// chosen by the model.
//
// Read-only by design: no tool writes, sends, or changes anything. Server-only.
// =====================================================================

import { resolveInspectionAccessFilter, resolveTeamInspectorIds } from "../inspectionAccess";
import {
  isPaymentComplete,
  isPublished,
  getInvoiceAmount,
  getBalanceDue,
} from "../inspectionStatus";

export type AskFlowContext = {
  admin: any;
  userId: string;
  filter: { column: "company_id" | "inspector_id"; value: any };
  teamIds: string[];
  companyId: any | null;
  timeZone: string;
  today: string; // YYYY-MM-DD in the user's timezone
};

const INSPECTION_COLUMNS = [
  "id",
  "property_address",
  "city",
  "state",
  "zip",
  "client_name",
  "client_email",
  "realtor_name",
  "agent_name",
  "inspection_date",
  "inspection_time",
  "report_status",
  "published",
  "is_published",
  "published_at",
  "payment_status",
  "invoice_status",
  "invoice_amount",
  "total_price",
  "amount_paid",
  "balance_due",
  "paid_at",
  "service_type",
  "inspection_type",
  "is_demo",
  "created_at",
  "inspector_id",
  "company_id",
].join(", ");

function todayInZone(timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function buildAskFlowContext(admin: any, userId: string, timeZone?: string): Promise<AskFlowContext> {
  const filter = await resolveInspectionAccessFilter(admin, userId);
  const teamIds = await resolveTeamInspectorIds(admin, userId);

  let companyId: any = filter.column === "company_id" ? filter.value : null;
  if (!companyId) {
    try {
      const { data } = await admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .not("company_id", "is", null)
        .limit(1);
      companyId = data?.[0]?.company_id ?? null;
    } catch {
      companyId = null;
    }
  }

  const tz = timeZone || "America/New_York";
  return { admin, userId, filter, teamIds, companyId, timeZone: tz, today: todayInZone(tz) };
}

// ---------------------------------------------------------------------
// Shared: fetch the user's inspections (scoped, demos excluded), optionally
// within a date range. Capped — this is a chat assistant, not an export.
// ---------------------------------------------------------------------
async function fetchScopedInspections(
  ctx: AskFlowContext,
  opts: { from?: string; to?: string; dateField?: "inspection_date" | "created_at"; limit?: number } = {},
): Promise<any[]> {
  const dateField = opts.dateField || "inspection_date";
  let q = ctx.admin
    .from("inspections")
    .select(INSPECTION_COLUMNS)
    .eq(ctx.filter.column, ctx.filter.value)
    .order(dateField, { ascending: false })
    .limit(Math.min(opts.limit || 1000, 1000));

  if (opts.from) q = q.gte(dateField, opts.from);
  if (opts.to) q = q.lte(dateField, dateField === "created_at" ? `${opts.to}T23:59:59` : opts.to);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).filter((i: any) => i?.is_demo !== true);
}

function addressOf(i: any): string {
  const parts = [i?.property_address, i?.city, i?.state].filter(Boolean);
  return parts.join(", ") || "(no address)";
}

function shape(i: any) {
  return {
    id: i.id,
    address: addressOf(i),
    client: i?.client_name || null,
    agent: i?.realtor_name || i?.agent_name || null,
    date: i?.inspection_date || null,
    time: i?.inspection_time || null,
    service: i?.service_type || i?.inspection_type || null,
    published: isPublished(i),
    paid: isPaymentComplete(i),
    invoice_total: getInvoiceAmount(i) || null,
    balance_due: getBalanceDue(i) || 0,
    link: `/reports/${i.id}`,
  };
}

// Map of inspection_id -> has a SIGNED agreement on file (scoped to the team).
async function loadSignedAgreementSet(ctx: AskFlowContext, inspectionIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (inspectionIds.length === 0) return set;
  try {
    const { data } = await ctx.admin
      .from("inspection_agreements")
      .select("inspection_id, status")
      .in("inspection_id", inspectionIds)
      .eq("status", "signed");
    (data || []).forEach((a: any) => set.add(String(a.inspection_id)));
  } catch {
    /* agreements table optional — treat as none signed */
  }
  return set;
}

// ---------------------------------------------------------------------
// Tool definitions (OpenAI function-calling schema).
// ---------------------------------------------------------------------
export const ASK_FLOW_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "get_business_summary",
      description:
        "High-level rollup of the user's inspection business over a date range: counts of inspections, upcoming vs completed, unpaid, unsigned agreements, unpublished (draft) reports, and revenue billed vs collected. Use this for overview questions like 'how did I do this month' or 'how many inspections last week'. Omit dates for an all-time snapshot (capped to recent records).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD (inclusive), in the user's timezone." },
          to: { type: "string", description: "End date YYYY-MM-DD (inclusive)." },
          date_field: {
            type: "string",
            enum: ["inspection_date", "created_at"],
            description: "Which date to filter on. Default inspection_date.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_inspections",
      description:
        "List/filter individual inspections. The workhorse for questions like 'which upcoming jobs aren't paid', 'unsigned agreements', 'drafts from last week', 'jobs at 12 Oak St', 'what's on my schedule tomorrow'. Combine filters freely.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD (inclusive)." },
          to: { type: "string", description: "End date YYYY-MM-DD (inclusive)." },
          timeframe: {
            type: "string",
            enum: ["upcoming", "past", "all"],
            description: "upcoming = inspection_date >= today; past = < today; all = no constraint. Combine with from/to if you need a specific window.",
          },
          paid: { type: "boolean", description: "true = only paid, false = only unpaid/outstanding." },
          published: { type: "boolean", description: "true = only published reports, false = only unpublished (drafts)." },
          agreement_signed: { type: "boolean", description: "true = only jobs with a signed agreement on file, false = only jobs missing one." },
          query: { type: "string", description: "Free-text match against address, client name, or agent name." },
          limit: { type: "number", description: "Max rows (default 25, max 100)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_findings",
      description:
        "Search findings across the user's inspections. Use for questions like 'which jobs had major electrical concerns', 'safety issues this month', 'anything about roofs at 12 Oak St'. Returns findings with the inspection they belong to.",
      parameters: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            description: "Exact severity filter: Informational | Monitor | Maintenance | Recommended Repair | Safety Concern | Major Concern.",
          },
          section: { type: "string", description: "Section/system name filter (e.g. Electrical, Roof, Plumbing)." },
          query: { type: "string", description: "Free-text match against finding title/observation." },
          from: { type: "string", description: "Only findings whose inspection is on/after this date YYYY-MM-DD." },
          to: { type: "string", description: "Only findings whose inspection is on/before this date YYYY-MM-DD." },
          limit: { type: "number", description: "Max findings (default 30, max 100)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inspection_detail",
      description:
        "Deep detail on ONE inspection: contacts, payment/balance, agreement status, report status, and a breakdown of findings by severity. Identify it by id, or by an address/client query (best match).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The inspection id, if known." },
          query: { type: "string", description: "Address or client name to look up when id is unknown." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_schedule",
      description:
        "The user's booking availability template (working days + default time slots + blocked dates) plus the inspections already scheduled in a date range and any pending booking requests. Use for 'what slots are open in the next 3 days' — compare the template against what's already booked.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD (inclusive). Default today." },
          to: { type: "string", description: "End date YYYY-MM-DD (inclusive). Default 7 days out." },
        },
      },
    },
  },
];

// ---------------------------------------------------------------------
// Executor dispatch.
// ---------------------------------------------------------------------
export async function runAskFlowTool(name: string, args: any, ctx: AskFlowContext): Promise<any> {
  switch (name) {
    case "get_business_summary":
      return getBusinessSummary(ctx, args || {});
    case "search_inspections":
      return searchInspections(ctx, args || {});
    case "search_findings":
      return searchFindings(ctx, args || {});
    case "get_inspection_detail":
      return getInspectionDetail(ctx, args || {});
    case "get_schedule":
      return getSchedule(ctx, args || {});
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function getBusinessSummary(ctx: AskFlowContext, args: any) {
  const rows = await fetchScopedInspections(ctx, {
    from: args.from,
    to: args.to,
    dateField: args.date_field === "created_at" ? "created_at" : "inspection_date",
  });
  const ids = rows.map((r: any) => String(r.id));
  const signed = await loadSignedAgreementSet(ctx, ids);

  let billed = 0;
  let collected = 0;
  let outstanding = 0;
  let unpaid = 0;
  let drafts = 0;
  let upcoming = 0;
  let completed = 0;
  let unsigned = 0;

  for (const i of rows) {
    billed += getInvoiceAmount(i) || 0;
    collected += Number(i?.amount_paid || 0) || 0;
    if (!isPaymentComplete(i)) {
      unpaid += 1;
      outstanding += getBalanceDue(i) || 0;
    }
    if (!isPublished(i)) drafts += 1;
    if (i?.inspection_date && i.inspection_date >= ctx.today) upcoming += 1;
    else completed += 1;
    if (!signed.has(String(i.id))) unsigned += 1;
  }

  return {
    range: { from: args.from || "all-time (recent)", to: args.to || ctx.today },
    today: ctx.today,
    total_inspections: rows.length,
    upcoming,
    completed,
    unpaid_count: unpaid,
    outstanding_balance: Math.round(outstanding * 100) / 100,
    unpublished_drafts: drafts,
    jobs_without_signed_agreement: unsigned,
    revenue_billed: Math.round(billed * 100) / 100,
    revenue_collected: Math.round(collected * 100) / 100,
    note: "Counts exclude demo inspections. 'without signed agreement' = no agreement row with status 'signed' on file.",
  };
}

async function searchInspections(ctx: AskFlowContext, args: any) {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  let rows = await fetchScopedInspections(ctx, { from: args.from, to: args.to });

  if (args.timeframe === "upcoming") rows = rows.filter((i: any) => i?.inspection_date && i.inspection_date >= ctx.today);
  else if (args.timeframe === "past") rows = rows.filter((i: any) => i?.inspection_date && i.inspection_date < ctx.today);

  if (typeof args.paid === "boolean") rows = rows.filter((i: any) => isPaymentComplete(i) === args.paid);
  if (typeof args.published === "boolean") rows = rows.filter((i: any) => isPublished(i) === args.published);

  if (typeof args.agreement_signed === "boolean") {
    const signed = await loadSignedAgreementSet(ctx, rows.map((r: any) => String(r.id)));
    rows = rows.filter((i: any) => signed.has(String(i.id)) === args.agreement_signed);
  }

  if (args.query) {
    const q = String(args.query).toLowerCase();
    rows = rows.filter((i: any) =>
      [i?.property_address, i?.city, i?.client_name, i?.realtor_name, i?.agent_name]
        .filter(Boolean)
        .some((v: any) => String(v).toLowerCase().includes(q)),
    );
  }

  const total = rows.length;
  return { count: total, showing: Math.min(total, limit), inspections: rows.slice(0, limit).map(shape) };
}

async function searchFindings(ctx: AskFlowContext, args: any) {
  const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);

  // Scope: only findings that belong to the user's inspections.
  const inspRows = await fetchScopedInspections(ctx, { from: args.from, to: args.to });
  const byId = new Map<string, any>();
  inspRows.forEach((i: any) => byId.set(String(i.id), i));
  const ids = [...byId.keys()];
  if (ids.length === 0) return { count: 0, findings: [] };

  let q = ctx.admin
    .from("findings")
    .select("id, inspection_id, section, title, observation, severity, location, created_at")
    .in("inspection_id", ids)
    .limit(500);
  if (args.severity) q = q.eq("severity", args.severity);
  if (args.section) q = q.ilike("section", `%${args.section}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let findings = data || [];
  if (args.query) {
    const qq = String(args.query).toLowerCase();
    findings = findings.filter((f: any) =>
      [f?.title, f?.observation, f?.location].filter(Boolean).some((v: any) => String(v).toLowerCase().includes(qq)),
    );
  }

  const total = findings.length;
  return {
    count: total,
    showing: Math.min(total, limit),
    findings: findings.slice(0, limit).map((f: any) => {
      const insp = byId.get(String(f.inspection_id));
      return {
        title: f?.title || "(untitled)",
        severity: f?.severity || null,
        section: f?.section || null,
        location: f?.location || null,
        observation: f?.observation ? String(f.observation).slice(0, 240) : null,
        inspection: insp ? addressOf(insp) : null,
        date: insp?.inspection_date || null,
        link: `/reports/${f.inspection_id}`,
      };
    }),
  };
}

async function getInspectionDetail(ctx: AskFlowContext, args: any) {
  let inspection: any = null;

  if (args.id) {
    const { data } = await ctx.admin
      .from("inspections")
      .select(INSPECTION_COLUMNS)
      .eq("id", String(args.id))
      .eq(ctx.filter.column, ctx.filter.value)
      .maybeSingle();
    inspection = data || null;
  }

  if (!inspection && args.query) {
    const rows = await fetchScopedInspections(ctx, {});
    const q = String(args.query).toLowerCase();
    inspection =
      rows.find((i: any) =>
        [i?.property_address, i?.city, i?.client_name, i?.realtor_name, i?.agent_name]
          .filter(Boolean)
          .some((v: any) => String(v).toLowerCase().includes(q)),
      ) || null;
  }

  if (!inspection) return { found: false, note: "No matching inspection you have access to." };

  const id = String(inspection.id);
  const signed = await loadSignedAgreementSet(ctx, [id]);

  const bySeverity: Record<string, number> = {};
  let findingsTotal = 0;
  try {
    const { data: fRows } = await ctx.admin.from("findings").select("severity").in("inspection_id", [id]).limit(1000);
    (fRows || []).forEach((f: any) => {
      findingsTotal += 1;
      const s = f?.severity || "Unspecified";
      bySeverity[s] = (bySeverity[s] || 0) + 1;
    });
  } catch {
    /* findings optional */
  }

  return {
    found: true,
    ...shape(inspection),
    email: inspection?.client_email || null,
    agreement_signed: signed.has(id),
    findings_total: findingsTotal,
    findings_by_severity: bySeverity,
  };
}

async function getSchedule(ctx: AskFlowContext, args: any) {
  const from = args.from || ctx.today;
  const to = args.to || addDays(ctx.today, 7);

  // Availability template (owner's row for a company; else the user's own).
  let availability: any = null;
  try {
    const ownerId = ctx.teamIds[0] || ctx.userId;
    const { data } = await ctx.admin
      .from("inspector_availability")
      .select("booking_enabled, available_days, default_times, blocked_dates, timezone")
      .in("user_id", ctx.teamIds.length ? ctx.teamIds : [ownerId])
      .limit(1);
    availability = data?.[0] || null;
  } catch {
    availability = null;
  }

  // Already-scheduled inspections in the window.
  const booked = (await fetchScopedInspections(ctx, { from, to }))
    .map((i: any) => ({ date: i?.inspection_date, time: i?.inspection_time, address: addressOf(i), link: `/reports/${i.id}` }))
    .filter((b: any) => b.date);

  // Pending booking requests (scoped by company).
  let pending: any[] = [];
  if (ctx.companyId) {
    try {
      const { data } = await ctx.admin
        .from("booking_requests")
        .select("preferred_date, preferred_time, property_address, client_name, status")
        .eq("company_id", ctx.companyId)
        .eq("status", "pending")
        .limit(50);
      pending = (data || []).map((r: any) => ({
        date: r?.preferred_date || null,
        time: r?.preferred_time || null,
        address: r?.property_address || null,
        client: r?.client_name || null,
      }));
    } catch {
      pending = [];
    }
  }

  return {
    range: { from, to },
    today: ctx.today,
    booking_enabled: availability?.booking_enabled ?? null,
    working_days: availability?.available_days || null,
    default_time_slots: availability?.default_times || null,
    blocked_dates: availability?.blocked_dates || null,
    scheduled: booked,
    pending_requests: pending,
    note: "Compare default_time_slots on each working day against 'scheduled' to find open slots. Days in blocked_dates are off.",
  };
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

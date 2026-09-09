import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, getAdminClient } from "../../../../lib/apiAuth";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live "jump to a report" search for the command palette. Scoped to what the
// user may see (owner -> company, inspector -> own) so it can never surface
// another company's inspections. Read-only.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const raw = new URL(req.url).searchParams.get("q") || "";
  // Strip characters that would break the PostgREST or() filter string.
  const q = raw.replace(/[,%()*]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const admin = getAdminClient();
  const filter = await resolveInspectionAccessFilter(admin, user.id);

  const like = `%${q}%`;
  const { data, error } = await admin
    .from("inspections")
    .select("id, property_address, city, state, client_name, realtor_name, agent_name, inspection_date, report_status, is_demo")
    .eq(filter.column, filter.value)
    .or(
      [
        `property_address.ilike.${like}`,
        `city.ilike.${like}`,
        `client_name.ilike.${like}`,
        `realtor_name.ilike.${like}`,
        `agent_name.ilike.${like}`,
      ].join(","),
    )
    .order("inspection_date", { ascending: false })
    .limit(8);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data || [])
    .filter((i: any) => i?.is_demo !== true)
    .map((i: any) => {
      const address = [i?.property_address, i?.city, i?.state].filter(Boolean).join(", ") || "(no address)";
      const parts = [i?.client_name, i?.inspection_date].filter(Boolean);
      return {
        id: String(i.id),
        label: address,
        sublabel: parts.join(" · ") || "Inspection",
        href: `/reports/${i.id}`,
      };
    });

  return NextResponse.json({ results });
}

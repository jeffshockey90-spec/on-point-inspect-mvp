
import { formatAppValue } from "../../../../lib/app-time";
import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanText(value: any) {
  return String(value || "").trim();
}

function formatDate(value: any) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildAddress(row: any) {
  return (
    cleanText(row?.address) ||
    cleanText(row?.property_address) ||
    cleanText(row?.full_address) ||
    cleanText(row?.propertyAddress) ||
    [row?.street, row?.city, row?.state, row?.zip]
      .map(cleanText)
      .filter(Boolean)
      .join(", ")
  );
}

function mapReport(row: any) {
  const address = buildAddress(row) || "Untitled Report";
  const date =
    formatDate(row?.inspection_date) ||
    formatDate(row?.scheduled_date) ||
    formatDate(row?.created_at) ||
    formatDate(row?.updated_at);

  return {
    id: cleanText(row?.id),
    label: date ? `${address} — ${date}` : address,
    address,
  };
}

async function safeMany(query: any) {
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Only ever list the LOGGED-IN inspector's OWN reports. RLS alone is not
  // enough here: the platform owner can read every inspector's rows, which made
  // the Marketing Studio show other inspectors' reports (and would leak them to
  // each other if an RLS policy ever slipped). Filtering by inspector_id makes
  // this tool per-user regardless of role.
  const inspections = await safeMany(
    supabase
      .from("inspections")
      .select("*")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false })
      .limit(75)
  );

  const reports = await safeMany(
    supabase
      .from("reports")
      .select("*")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false })
      .limit(75)
  );

  const all = [...inspections, ...reports].map(mapReport).filter((item) => item.id);

  const seen = new Set<string>();
  const unique = all.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return NextResponse.json({ reports: unique });
}

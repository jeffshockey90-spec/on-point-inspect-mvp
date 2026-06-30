import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanText(value: any) {
  return String(value || "").trim();
}

function formatDate(value: any) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
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

  // Let Supabase RLS decide what the logged-in inspector can see.
  // This avoids over-filtering and returning an empty dropdown.
  const inspections = await safeMany(
    supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(75)
  );

  const reports = await safeMany(
    supabase
      .from("reports")
      .select("*")
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

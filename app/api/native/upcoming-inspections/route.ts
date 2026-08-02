import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: companyUser } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let query = supabase
    .from("inspections")
    .select("id,property_address,property_latitude,property_longitude,inspection_date,inspection_time,inspector_id,company_id")
    .not("inspection_date", "is", null)
    .order("inspection_date", { ascending: true })
    .limit(50);

  if (companyUser?.company_id) query = query.eq("company_id", companyUser.company_id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inspections = (data || []).filter((row: any) => !row.inspector_id || row.inspector_id === user.id);
  return NextResponse.json({ inspections });
}

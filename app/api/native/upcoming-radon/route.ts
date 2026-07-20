import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: inspections, error: inspectionError } = await supabase.from("inspections").select("id,property_address").eq("inspector_id", user.id);
  if (inspectionError) return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  const ids = (inspections || []).map((i: any) => i.id);
  if (!ids.length) return NextResponse.json({ tests: [] });
  const { data, error } = await supabase.from("radon_tests").select("id,inspection_id,start_time,end_time,device_name,serial_number,report_status,inspections(property_address)").in("inspection_id", ids).or(`start_time.gte.${new Date(Date.now()-86400000).toISOString()},end_time.gte.${new Date(Date.now()-86400000).toISOString()}`).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tests: data || [] });
}

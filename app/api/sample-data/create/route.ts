
import { toLocalDateKey } from "../../../../lib/app-time";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toLocalDateKey(date, "UTC");
}

export async function POST() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: existingSample } = await supabase
    .from("inspections")
    .select("id")
    .eq("inspector_id", user.id)
    .ilike("property_address", "%SAMPLE%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSample?.id) {
    return NextResponse.json({
      ok: true,
      reused: true,
      inspectionId: existingSample.id,
    });
  }

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .insert({
      inspector_id: user.id,
      property_address: "SAMPLE - 123 Training House Rd",
      address: "SAMPLE - 123 Training House Rd",
      client_name: "Sample Client",
      client_email: "sample-client@example.com",
      realtor_name: "Sample Realtor",
      realtor_email: "sample-realtor@example.com",
      inspection_date: tomorrowDate(),
      report_status: "Draft",
      published: false,
      invoice_status: "Unpaid",
      payment_status: "Unpaid",
      invoice_amount: 500,
      amount_paid: 0,
      balance_due: 500,
      notes:
        "SAMPLE DATA: Safe training inspection created from onboarding. Delete when finished testing.",
    })
    .select("id")
    .single();

  if (inspectionError || !inspection?.id) {
    return NextResponse.json(
      { error: inspectionError?.message || "Could not create sample inspection." },
      { status: 500 }
    );
  }

  const inspectionId = inspection.id;

  await supabase.from("findings").insert([
    {
      inspection_id: inspectionId,
      section: "Roof",
      title: "SAMPLE - Damaged Shingles",
      observation:
        "Several shingles are damaged or deteriorated at the front roof slope.",
      implication:
        "Damaged shingles can allow water intrusion and may reduce roof covering performance.",
      recommendation:
        "Recommend correction by a qualified roofing contractor.",
      severity: "Recommended Repair",
      defect_type: "Repair",
      repair_request: true,
      repair_priority: "Recommended",
    },
    {
      inspection_id: inspectionId,
      section: "Electrical",
      title: "SAMPLE - Missing GFCI Protection",
      observation:
        "GFCI protection was not confirmed at one or more recommended locations.",
      implication:
        "Missing GFCI protection can increase shock hazard risk.",
      recommendation:
        "Recommend correction by a qualified electrical contractor.",
      severity: "Safety Concern",
      defect_type: "Safety",
      repair_request: true,
      repair_priority: "Safety",
    },
    {
      inspection_id: inspectionId,
      section: "Plumbing",
      title: "SAMPLE - Minor Sink Drain Leak",
      observation:
        "A minor leak was noted below the sink during operation.",
      implication:
        "Leaks can damage cabinet materials and may worsen over time.",
      recommendation:
        "Recommend repair by a qualified plumbing contractor.",
      severity: "Recommended Repair",
      defect_type: "Repair",
      repair_request: true,
      repair_priority: "Recommended",
    },
  ]);

  await supabase.from("inspection_contacts").insert([
    {
      inspection_id: inspectionId,
      name: "Sample Client",
      email: "sample-client@example.com",
      role: "client",
      agreement_required: true,
      agreement_signed: false,
    },
    {
      inspection_id: inspectionId,
      name: "Sample Realtor",
      email: "sample-realtor@example.com",
      role: "realtor",
      agreement_required: false,
      agreement_signed: false,
    },
  ]);

  return NextResponse.json({
    ok: true,
    inspectionId,
  });
}

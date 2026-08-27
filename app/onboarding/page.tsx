import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import OnboardingChecklist from "../../components/OnboardingChecklist";

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
        setAll() {},
      },
    }
  );
}

function isPublished(inspection: any) {
  return (
    inspection?.published === true ||
    String(inspection?.report_status || "").toLowerCase() === "published"
  );
}

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspectionsRaw } = await supabase
    .from("inspections")
    .select("id, property_address, address, client_name, report_status, published, payment_status, invoice_status, notes, created_at")
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  const inspections = inspectionsRaw || [];

  const { data: companyUser } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: company } = companyUser?.company_id
    ? await supabase
        .from("companies")
        .select("*")
        .eq("id", companyUser.company_id)
        .maybeSingle()
    : { data: null };

  const { data: agreementsRaw } =
    inspections.length > 0
      ? await supabase
          .from("inspection_contacts")
          .select("id")
          .in(
            "inspection_id",
            inspections.map((inspection: any) => inspection.id)
          )
          .eq("agreement_required", true)
      : { data: [] };

  const companyProfileReady = Boolean(
    company?.name ||
      company?.company_name ||
      company?.logo_url ||
      company?.phone ||
      company?.email
  );

  const hasOfficeAddress = Boolean(String(company?.office_address || "").trim());

  const hasCustomStandardsOfPractice = Boolean(
    String(company?.standards_of_practice_body || "").trim()
  );

  const agreementSetupReady =
    (agreementsRaw || []).length > 0 || hasCustomStandardsOfPractice;

  return (
    <main className="min-h-screen bg-[#0a0e13] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <OnboardingChecklist
          inspectionCount={inspections.length}
          draftReportCount={inspections.filter((inspection: any) => !isPublished(inspection)).length}
          publishedReportCount={inspections.filter(isPublished).length}
          companyProfileReady={companyProfileReady}
          hasOfficeAddress={hasOfficeAddress}
          agreementSetupReady={agreementSetupReady}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import BookingRequestForm from "../../components/BookingRequestForm";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function getCompanyBySlug(slug: string) {
  if (!slug) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select("id, name, display_name")
    .eq("profile_slug", slug)
    .maybeSingle();

  return data;
}

async function getAvailabilityForCompany(companyId: number | null) {
  if (!companyId) return null;

  const admin = createAdminClient();

  const { data: companyUser } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .maybeSingle();

  if (!companyUser?.user_id) return null;

  const { data: availability } = await admin
    .from("inspector_availability")
    .select("booking_enabled, available_days, default_times, blocked_dates, timezone")
    .eq("user_id", companyUser.user_id)
    .maybeSingle();

  return availability;
}

export default async function BookInspectionPage({
  searchParams,
}: {
  searchParams?: Promise<{ inspector?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const companySlug = String(resolvedSearchParams?.inspector || "").trim();
  const company = companySlug ? await getCompanyBySlug(companySlug) : null;
  const companyName = company?.display_name || company?.name || "FLOW";
  const availability = await getAvailabilityForCompany(company?.id || null);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[0.85fr_1.15fr] xl:items-start">
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-5 shadow-2xl sm:p-8 xl:sticky xl:top-6">
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-300">
            {companyName}
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight text-white sm:text-5xl">
            Request an Inspection
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-300">
            Realtors, clients, and partners can request an inspection here. Requests are reviewed before they become confirmed appointments.
          </p>

          <div className="mt-8 space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
              <p className="font-black text-teal-200">Fast Scheduling</p>
              <p className="mt-2 leading-6 text-slate-300">
                Most requests are reviewed quickly during business hours. The inspection is only added to the schedule after confirmation.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-[#020817]/70 p-4">
              <p className="font-black text-white">Same-day reports</p>
              <p className="mt-2 leading-6 text-slate-400">
                After the inspection, the finished report is delivered through the client portal.
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-teal-400 hover:text-teal-200"
          >
            Inspector login
          </Link>
        </section>

        <BookingRequestForm
          companySlug={companySlug}
          bookingEnabled={availability?.booking_enabled !== false}
          availableDays={availability?.available_days || undefined}
          availableTimes={availability?.default_times || undefined}
          blockedDates={availability?.blocked_dates || undefined}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import BookingRequestForm from "../../components/BookingRequestForm";
import { getBookingCompanyBySlug, getBookingAvailability } from "../../lib/booking";

export const dynamic = "force-dynamic";

export default async function BookInspectionPage({
  searchParams,
}: {
  searchParams?: Promise<{ inspector?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const companySlug = String(resolvedSearchParams?.inspector || "").trim();
  const company = companySlug ? await getBookingCompanyBySlug(companySlug) : null;
  const companyName = company?.display_name || company?.name || "FLOW";
  const availability = await getBookingAvailability(company?.id || null);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--fl-ground)] px-4 py-6 text-[var(--fl-text)] sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[0.85fr_1.15fr] xl:items-start">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-2xl sm:p-8 xl:sticky xl:top-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
            {companyName}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-[var(--fl-text)] sm:text-5xl">
            Request an Inspection
          </h1>
          <p className="mt-5 text-base leading-8 text-[var(--fl-muted)]">
            Realtors, clients, and partners can request an inspection here. Requests are reviewed before they become confirmed appointments.
          </p>

          <div className="mt-8 space-y-4 text-sm text-[var(--fl-muted)]">
            <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
              <p className="font-semibold text-[var(--fl-accent-text)]">Fast Scheduling</p>
              <p className="mt-2 leading-6 text-[var(--fl-muted)]">
                Most requests are reviewed quickly during business hours. The inspection is only added to the schedule after confirmation.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
              <p className="font-semibold text-[var(--fl-text)]">Same-day reports</p>
              <p className="mt-2 leading-6 text-[var(--fl-muted)]">
                After the inspection, the finished report is delivered through the client portal.
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-[var(--fl-muted)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)]"
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

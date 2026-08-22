import BookingRequestForm from "../../../components/BookingRequestForm";
import EmbedAutoHeight from "../../../components/EmbedAutoHeight";
import { getBookingCompanyBySlug, getBookingAvailability } from "../../../lib/booking";

export const dynamic = "force-dynamic";

// Chrome-free, iframe-embeddable version of /book. Same form + availability,
// no app nav / marketing sidebar / login CTA. Host it on any site with the
// snippet from Settings → Public Profile. (/embed is in navVisibility so the
// app shell is stripped; EmbedAutoHeight sizes the iframe to fit.)
export default async function EmbedBookPage({
  searchParams,
}: {
  searchParams?: Promise<{ inspector?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const companySlug = String(sp?.inspector || "").trim();
  const company = companySlug ? await getBookingCompanyBySlug(companySlug) : null;
  const availability = await getBookingAvailability(company?.id || null);

  return (
    <main className="p-3 text-white">
      <EmbedAutoHeight />
      <BookingRequestForm
        companySlug={companySlug}
        bookingEnabled={availability?.booking_enabled !== false}
        availableDays={availability?.available_days || undefined}
        availableTimes={availability?.default_times || undefined}
        blockedDates={availability?.blocked_dates || undefined}
      />
    </main>
  );
}

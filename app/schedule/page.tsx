
import { formatAppValue } from "../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import ScheduleCalendar from "../../components/ScheduleCalendar";
import ScheduleReminderSettings from "../../components/ScheduleReminderSettings";
import BookingRequestActions from "../../components/BookingRequestActions";
import InspectorAvailabilitySettings from "../../components/InspectorAvailabilitySettings";

type InspectionRow = Record<string, any>;
type BookingRequestRow = Record<string, any>;

function getInspectionDate(row: InspectionRow) {
  return (
    row.inspection_date ||
    row.scheduled_date ||
    row.date ||
    row.start_date ||
    null
  );
}

function getInspectionTime(row: InspectionRow) {
  return (
    row.inspection_time ||
    row.scheduled_time ||
    row.time ||
    row.start_time ||
    ""
  );
}

function getAddress(row: InspectionRow) {
  const parts = [
    row.address || row.property_address || row.street || row.location,
    row.city,
    row.state,
    row.zip || row.zip_code,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Address not entered";
}

function getClient(row: InspectionRow) {
  return (
    row.client_name ||
    row.client ||
    row.buyer_name ||
    row.customer_name ||
    row.customer ||
    "Client not entered"
  );
}

function getRealtor(row: InspectionRow) {
  return (
    row.realtor_name ||
    row.agent_name ||
    row.realtor ||
    row.agent ||
    row.buyers_agent ||
    row.listing_agent ||
    "Realtor not entered"
  );
}

function getStatus(row: InspectionRow) {
  return row.status || row.inspection_status || "Scheduled";
}

function formatDate(value: string | null) {
  if (!value) return "Date not entered";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return formatAppValue(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string) {
  if (!value) return "";

  const clean = String(value).trim();

  if (/^\d{1,2}:\d{2}/.test(clean)) {
    const [hoursRaw, minutesRaw] = clean.split(":");

    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw.slice(0, 2));

    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      const date = new Date();

      date.setHours(hours, minutes, 0, 0);

      return formatAppValue(date, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  const date = new Date(clean);

  if (!Number.isNaN(date.getTime())) {
    return formatAppValue(date, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return clean;
}


function formatBookingDate(value: any) {
  if (!value) return "Date not entered";
  // Noon anchor, not midnight: new Date("...T00:00:00") is midnight UTC, which
  // formatAppValue then renders in Eastern as the previous day. Noon keeps the
  // calendar date stable across US timezones.
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatAppValue(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBookingAddress(row: BookingRequestRow) {
  return [row.property_address, row.city, row.state, row.zip].filter(Boolean).join(", ") || "Address not entered";
}

function statusClass(status: string) {
  const lower = status.toLowerCase();

  if (lower.includes("complete") || lower.includes("done")) {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }

  if (lower.includes("cancel")) {
    return "border-red-400/40 bg-red-500/10 text-red-200";
  }

  if (lower.includes("draft") || lower.includes("pending")) {
    return "border-yellow-400/40 bg-yellow-500/10 text-yellow-200";
  }

  return "border-cyan-400/40 bg-cyan-500/10 text-cyan-200";
}

function sortScheduleRows(rows: InspectionRow[]) {
  return [...rows].sort((a, b) => {
    const aDate = getInspectionDate(a) || a.created_at || "";
    const bDate = getInspectionDate(b) || b.created_at || "";
    const aTime = getInspectionTime(a) || "00:00";
    const bTime = getInspectionTime(b) || "00:00";

    return `${aDate} ${aTime}`.localeCompare(`${bDate} ${bTime}`);
  });
}

export default async function SchedulePage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: companyUser } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: company } = companyUser?.company_id
    ? await supabase
        .from("companies")
        .select("profile_slug")
        .eq("id", companyUser.company_id)
        .maybeSingle()
    : { data: null };

  const bookingPageHref = company?.profile_slug
    ? `/book?inspector=${encodeURIComponent(company.profile_slug)}`
    : "/book";

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .order("created_at", {
      ascending: false,
    });

  const { data: bookingRequestsRaw, error: bookingRequestsError } = await supabase
    .from("booking_requests")
    .select("*")
    .order("created_at", {
      ascending: false,
    });

  const rows = inspections ?? [];
  const bookingRequests = bookingRequestsRaw ?? [];
  const pendingBookingRequests = bookingRequests.filter(
    (request: BookingRequestRow) => String(request.status || "pending").toLowerCase() === "pending"
  );
  const scheduledRows = rows.filter((row) => getInspectionDate(row));
  const unscheduledRows = rows.filter((row) => !getInspectionDate(row));
  const sortedRows = sortScheduleRows(scheduledRows);

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white sm:p-6">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-teal-400 sm:text-4xl">
              Inspection Schedule
            </h1>

            <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
              Manage the full inspection schedule from the calendar. Drag appointments
              to reschedule, click an appointment to edit, delete, or open the report.
            </p>
          </div>

          <Link
            href="/inspections/new"
            className="rounded-2xl border border-teal-400/30 bg-teal-500 px-5 py-3 text-center text-sm font-bold text-black transition hover:bg-teal-300 active:scale-[0.98]"
          >
            + New Inspection
          </Link>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-950/40 p-6 text-red-100">
            Schedule could not load: {error.message}
          </div>
        ) : null}

        {bookingRequestsError ? (
          <div className="mb-6 rounded-2xl border border-yellow-500/40 bg-yellow-950/30 p-5 text-yellow-100">
            Booking requests could not load. If this is your first install, run the booking SQL migration first. {bookingRequestsError.message}
          </div>
        ) : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Scheduled
            </p>
            <p className="mt-2 text-3xl font-bold text-white">
              {scheduledRows.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Unscheduled
            </p>
            <p className="mt-2 text-3xl font-bold text-yellow-200">
              {unscheduledRows.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Total Reports
            </p>
            <p className="mt-2 text-3xl font-bold text-teal-300">
              {rows.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Booking Requests
            </p>
            <p className="mt-2 text-3xl font-bold text-teal-300">
              {pendingBookingRequests.length}
            </p>
          </div>
        </div>

        <ScheduleReminderSettings />
        <InspectorAvailabilitySettings />

        <section className="mb-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-teal-300">Pending Booking Requests</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Public and realtor requests land here first. Confirming a request creates a scheduled inspection from the requested date, time, client, realtor, and property details.
              </p>
            </div>

            <Link
              href={bookingPageHref}
              className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-center text-sm font-black text-teal-200 transition hover:bg-teal-500/20"
            >
              Open Booking Page
            </Link>
          </div>

          {pendingBookingRequests.length === 0 ? (
            <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-sm text-slate-400">
              No pending booking requests right now.
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {pendingBookingRequests.map((request: BookingRequestRow) => (
                <article key={request.id} className="rounded-2xl border border-slate-700 bg-[#020817]/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                        {request.requester_role || "Requester"}
                      </p>
                      <h3 className="mt-1 text-lg font-black text-white">
                        {request.realtor_name || request.requester_name || "Name not entered"}
                      </h3>
                      <p className="mt-1 break-all text-sm text-slate-400">
                        {[request.realtor_phone || request.requester_phone, request.realtor_email || request.requester_email].filter(Boolean).join(" • ") || "No contact"}
                      </p>
                    </div>

                    <span className="rounded-full border border-yellow-400/40 bg-yellow-500/10 px-3 py-1 text-xs font-black text-yellow-200">
                      Pending
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Requested Time</p>
                      <p className="mt-1 font-bold text-white">{formatBookingDate(request.preferred_date)}</p>
                      <p className="text-slate-400">{formatTime(request.preferred_time || "")}</p>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Client</p>
                      <p className="mt-1 font-bold text-white">{request.client_name || "Not entered"}</p>
                      <p className="break-all text-slate-400">{[request.client_phone, request.client_email].filter(Boolean).join(" • ") || "No contact"}</p>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 sm:col-span-2">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Property</p>
                      <p className="mt-1 font-bold text-teal-100">{getBookingAddress(request)}</p>
                      <p className="mt-1 text-slate-400">{Array.isArray(request.services) ? request.services.join(" • ") : request.services || request.service_type || "Home Inspection"}</p>
                    </div>
                  </div>

                  {request.notes ? (
                    <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-300">
                      {request.notes}
                    </p>
                  ) : null}

                  <div className="mt-5">
                    <BookingRequestActions requestId={String(request.id)} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mb-8">
          <ScheduleCalendar inspections={scheduledRows} />
        </div>

        {unscheduledRows.length > 0 ? (
          <div className="mb-8 rounded-2xl border border-yellow-500/30 bg-yellow-950/20 p-5">
            <h2 className="text-lg font-bold text-yellow-100">
              Reports missing a schedule date
            </h2>

            <p className="mt-2 text-sm text-yellow-100/70">
              These reports will not appear on the calendar until a date is added.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unscheduledRows.slice(0, 9).map((inspection: InspectionRow) => (
                <Link
                  key={inspection.id}
                  href={`/reports/${inspection.id}`}
                  className="rounded-xl border border-yellow-500/20 bg-black/30 p-4 transition hover:bg-yellow-500/10"
                >
                  <p className="text-sm font-bold text-white">
                    {getAddress(inspection)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {getClient(inspection)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {rows.length === 0 && !error ? (
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <h2 className="text-xl font-bold text-white">
              No inspections scheduled yet
            </h2>

            <p className="mt-2 text-slate-400">
              Once inspections are created, they will show here with the date,
              time, address, client, realtor, and status.
            </p>
          </div>
        ) : sortedRows.length > 0 ? (
          <details className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]">
            <summary className="cursor-pointer bg-zinc-950 px-5 py-4 text-sm font-bold text-teal-300 transition hover:bg-zinc-900">
              Show inspection list
            </summary>

            <div className="hidden grid-cols-[1.1fr_1.7fr_1fr_1fr_.8fr_.7fr] gap-4 border-b border-zinc-800 bg-zinc-950 px-5 py-4 text-xs font-bold uppercase tracking-widest text-teal-300 lg:grid">
              <div>Date / Time</div>
              <div>Property</div>
              <div>Client</div>
              <div>Realtor</div>
              <div>Status</div>
              <div className="text-right">Open</div>
            </div>

            <div className="divide-y divide-zinc-800">
              {sortedRows.map((inspection: InspectionRow) => {
                const date = getInspectionDate(inspection);
                const time = formatTime(getInspectionTime(inspection));
                const status = getStatus(inspection);

                return (
                  <div
                    key={inspection.id}
                    className="grid gap-4 px-5 py-5 hover:bg-zinc-800/60 lg:grid-cols-[1.1fr_1.7fr_1fr_1fr_.8fr_.7fr] lg:items-center"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">
                        {formatDate(date)}
                      </p>

                      <p className="mt-1 text-sm text-slate-400">
                        {time || "Time not entered"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-teal-100">
                        {getAddress(inspection)}
                      </p>

                      {(inspection.inspection_type || inspection.type) && (
                        <p className="mt-1 text-xs text-slate-500">
                          {inspection.inspection_type || inspection.type}
                        </p>
                      )}
                    </div>

                    <p className="text-sm text-zinc-200">
                      {getClient(inspection)}
                    </p>

                    <p className="text-sm text-zinc-200">
                      {getRealtor(inspection)}
                    </p>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                    </div>

                    <div className="flex lg:justify-end">
                      <Link
                        href={`/reports/${inspection.id}`}
                        className="rounded-xl border border-teal-400/30 bg-teal-500/10 px-4 py-2 text-sm font-bold text-teal-200 transition hover:bg-teal-500/20"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}

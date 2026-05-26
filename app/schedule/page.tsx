import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import ScheduleCalendar from "../../components/ScheduleCalendar";

type InspectionRow = Record<string, any>;

function getInspectionDate(row: InspectionRow) {
  return (
    row.inspection_date ||
    row.scheduled_date ||
    row.date ||
    row.start_date ||
    row.created_at ||
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

  return date.toLocaleDateString("en-US", {
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

    if (
      !Number.isNaN(hours) &&
      !Number.isNaN(minutes)
    ) {
      const date = new Date();

      date.setHours(hours, minutes, 0, 0);

      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  const date = new Date(clean);

  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return clean;
}

function statusClass(status: string) {
  const lower = status.toLowerCase();

  if (
    lower.includes("complete") ||
    lower.includes("done")
  ) {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }

  if (lower.includes("cancel")) {
    return "border-red-400/40 bg-red-500/10 text-red-200";
  }

  if (
    lower.includes("draft") ||
    lower.includes("pending")
  ) {
    return "border-yellow-400/40 bg-yellow-500/10 text-yellow-200";
  }

  return "border-cyan-400/40 bg-cyan-500/10 text-cyan-200";
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

  const { data: inspections, error } =
    await supabase
      .from("inspections")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

  const rows = inspections ?? [];

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-teal-400">
              Inspection Schedule
            </h1>

            <p className="mt-3 text-zinc-400">
              Upcoming inspections from your
              inspections table.
            </p>
          </div>

          <Link
            href="/inspections/new"
            className="rounded-2xl border border-teal-400/30 bg-teal-500 px-5 py-3 text-center text-sm font-bold text-black transition hover:bg-teal-300"
          >
            + New Inspection
          </Link>
        </div>

        <div className="mb-8">
          <ScheduleCalendar inspections={rows} />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-6 text-red-100">
            Schedule could not load:{" "}
            {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-xl font-bold text-white">
              No inspections scheduled yet
            </h2>

            <p className="mt-2 text-zinc-400">
              Once inspections are created,
              they will show here with the
              date, time, address, client,
              realtor, and status.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <div className="hidden grid-cols-[1.1fr_1.7fr_1fr_1fr_.8fr_.7fr] gap-4 border-b border-zinc-800 bg-zinc-950 px-5 py-4 text-xs font-bold uppercase tracking-widest text-teal-300 lg:grid">
              <div>Date / Time</div>
              <div>Property</div>
              <div>Client</div>
              <div>Realtor</div>
              <div>Status</div>
              <div className="text-right">
                Open
              </div>
            </div>

            <div className="divide-y divide-zinc-800">
              {rows.map(
                (inspection: InspectionRow) => {
                  const date =
                    getInspectionDate(
                      inspection
                    );

                  const time = formatTime(
                    getInspectionTime(
                      inspection
                    )
                  );

                  const status =
                    getStatus(inspection);

                  return (
                    <div
                      key={inspection.id}
                      className="grid gap-4 px-5 py-5 hover:bg-zinc-800/60 lg:grid-cols-[1.1fr_1.7fr_1fr_1fr_.8fr_.7fr] lg:items-center"
                    >
                      <div>
                        <p className="text-sm font-bold text-white">
                          {formatDate(date)}
                        </p>

                        <p className="mt-1 text-sm text-zinc-400">
                          {time ||
                            "Time not entered"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-bold text-teal-100">
                          {getAddress(
                            inspection
                          )}
                        </p>

                        {(inspection.inspection_type ||
                          inspection.type) && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {inspection.inspection_type ||
                              inspection.type}
                          </p>
                        )}
                      </div>

                      <p className="text-sm text-zinc-200">
                        {getClient(
                          inspection
                        )}
                      </p>

                      <p className="text-sm text-zinc-200">
                        {getRealtor(
                          inspection
                        )}
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
                }
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
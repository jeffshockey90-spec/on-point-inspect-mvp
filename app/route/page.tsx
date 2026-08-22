import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Stop = {
  id: number;
  label: string;
  address: string;
  time: string | null;
  lat: number;
  lng: number;
};

// Great-circle distance in miles.
function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Nearest-neighbor ordering starting from the office (or the first stop).
function orderStops(origin: { lat: number; lng: number } | null, stops: Stop[]) {
  const remaining = [...stops];
  const ordered: Stop[] = [];
  let cursor = origin || (remaining[0] ? { lat: remaining[0].lat, lng: remaining[0].lng } : null);
  while (remaining.length && cursor) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMiles(cursor, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    cursor = { lat: next.lat, lng: next.lng };
  }
  return ordered;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function prettyDate(ymdStr: string) {
  const d = new Date(`${ymdStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default async function RoutePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = searchParams ? await searchParams : {};
  const today = ymd(new Date());
  const date = sp?.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  // Office origin from the inspector's company.
  const { data: companyUser } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  let office: { lat: number; lng: number; address: string } | null = null;
  if (companyUser?.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("office_latitude, office_longitude, office_address")
      .eq("id", companyUser.company_id)
      .maybeSingle();
    if (co?.office_latitude && co?.office_longitude) {
      office = {
        lat: Number(co.office_latitude),
        lng: Number(co.office_longitude),
        address: co.office_address || "Office",
      };
    }
  }

  const { data: rows } = await supabase
    .from("inspections")
    .select("id, property_address, address, city, state, zip, client_name, inspection_time, property_latitude, property_longitude")
    .eq("inspector_id", user.id)
    .eq("inspection_date", date)
    .order("inspection_time", { ascending: true });

  const allForDay = rows || [];
  const stops: Stop[] = allForDay
    .filter((r: any) => r.property_latitude && r.property_longitude)
    .map((r: any) => ({
      id: r.id,
      label: r.property_address || r.address || r.client_name || `Inspection #${r.id}`,
      address: [r.property_address || r.address, r.city, r.state, r.zip].filter(Boolean).join(", "),
      time: r.inspection_time || null,
      lat: Number(r.property_latitude),
      lng: Number(r.property_longitude),
    }));
  const missingCoords = allForDay.length - stops.length;

  const ordered = orderStops(office, stops);

  // Total drive distance following the order (office -> stops).
  let totalMiles = 0;
  let prev = office ? { lat: office.lat, lng: office.lng } : ordered[0] ? { lat: ordered[0].lat, lng: ordered[0].lng } : null;
  for (const s of ordered) {
    if (prev) totalMiles += haversineMiles(prev, s);
    prev = { lat: s.lat, lng: s.lng };
  }

  // Google Maps directions link (origin office, ordered waypoints, last = destination).
  let mapsUrl = "";
  if (ordered.length) {
    const originStr = office ? `${office.lat},${office.lng}` : `${ordered[0].lat},${ordered[0].lng}`;
    const waypointStops = office ? ordered.slice(0, -1) : ordered.slice(1, -1);
    const destination = ordered[ordered.length - 1];
    const params = new URLSearchParams({
      api: "1",
      travelmode: "driving",
      origin: originStr,
      destination: `${destination.lat},${destination.lng}`,
    });
    if (waypointStops.length) {
      params.set("waypoints", waypointStops.map((s) => `${s.lat},${s.lng}`).join("|"));
    }
    mapsUrl = `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  const dayShift = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    return ymd(d);
  };

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-400">Dispatch</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Day Route</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Your inspections for the day, ordered to minimize drive time from the office.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/route?date=${dayShift(-1)}`} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-300 hover:border-teal-400 hover:text-teal-300">← Prev</Link>
            <span className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm font-black text-teal-200">{prettyDate(date)}</span>
            <Link href={`/route?date=${dayShift(1)}`} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-300 hover:border-teal-400 hover:text-teal-300">Next →</Link>
            {date !== today && (
              <Link href="/route" className="text-sm font-black text-teal-300 hover:text-teal-200">Today</Link>
            )}
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Stops</p>
            <p className="mt-2 text-4xl font-black text-teal-300">{ordered.length}</p>
          </div>
          <div className="rounded-2xl border border-blue-500/40 bg-blue-950/20 p-6">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Est. Drive</p>
            <p className="mt-2 text-4xl font-black text-blue-300">{totalMiles.toFixed(0)} mi</p>
            <p className="mt-1 text-xs text-slate-500">Straight-line estimate.</p>
          </div>
        </section>

        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400"
          >
            Open optimized route in Google Maps →
          </a>
        )}

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">Order</h2>
          {office && (
            <p className="mt-2 text-sm text-slate-400">Starting from office: {office.address}</p>
          )}

          {ordered.length === 0 ? (
            <p className="mt-5 text-slate-400">
              No inspections with a mapped location on this day.
              {missingCoords > 0 ? ` (${missingCoords} without coordinates.)` : ""}
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {ordered.map((s, i) => (
                <li key={s.id} className="flex items-start gap-4 rounded-xl border border-slate-700 bg-black/30 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500 text-sm font-black text-slate-950">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{s.label}</p>
                    <p className="text-sm text-slate-400">{s.address}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      {s.time && <span>Scheduled {s.time}</span>}
                      <Link href={`/reports/${s.id}`} className="font-black text-teal-300 hover:text-teal-200">
                        Open report
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {missingCoords > 0 && ordered.length > 0 && (
            <p className="mt-4 text-xs text-amber-300">
              {missingCoords} inspection{missingCoords === 1 ? "" : "s"} on this day couldn&apos;t be
              routed (no mapped location).
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

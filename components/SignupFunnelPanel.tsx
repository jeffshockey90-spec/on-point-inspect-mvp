import { createClient } from "@supabase/supabase-js";

// Owner-only acquisition funnel, read from app_device_events (the events fired
// by lib/funnel.ts on the marketing homepage + signup page). Answers the key
// question directly: is "no new signups" a TRAFFIC problem (few homepage /
// signup-page views) or a CONVERSION problem (views that don't finish)?
//
// Self-contained server component: creates its own service-role client and
// renders nothing if analytics aren't available, so it's safe to drop onto the
// owner dashboard with a single line.

type Row = { event_type: string | null; device_id: string | null; created_at: string | null };

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

export default async function SignupFunnelPanel() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since30 = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
  const since7 = Date.now() - 1000 * 60 * 60 * 24 * 7;

  const EVENTS = [
    "home_view",
    "home_cta_click",
    "signup_page_view",
    "signup_started",
    "signup_completed",
  ];

  let rows: Row[] = [];
  try {
    const { data } = await admin
      .from("app_device_events")
      .select("event_type, device_id, created_at")
      .in("event_type", EVENTS)
      .gte("created_at", since30)
      .limit(20000);
    rows = (data as Row[]) || [];
  } catch {
    return null;
  }

  // Unique devices for top-of-funnel (visitors); raw counts for the actions.
  const uniq = (type: string, within7 = false) =>
    new Set(
      rows
        .filter(
          (r) =>
            r.event_type === type &&
            (!within7 || (r.created_at && new Date(r.created_at).getTime() >= since7)),
        )
        .map((r) => r.device_id || ""),
    ).size;
  const count = (type: string, within7 = false) =>
    rows.filter(
      (r) =>
        r.event_type === type &&
        (!within7 || (r.created_at && new Date(r.created_at).getTime() >= since7)),
    ).length;

  const homeViews = uniq("home_view");
  const ctaClicks = uniq("home_cta_click");
  const signupViews = uniq("signup_page_view");
  const started = count("signup_started");
  const completed = count("signup_completed");

  const completed7 = count("signup_completed", true);
  const signupViews7 = uniq("signup_page_view", true);

  const steps = [
    { label: "Homepage visitors", value: homeViews, note: "unique devices" },
    { label: "Clicked a signup CTA", value: ctaClicks, note: pct(ctaClicks, homeViews) + " of visitors" },
    { label: "Reached the signup page", value: signupViews, note: "unique devices" },
    { label: "Started signing up", value: started, note: pct(started, signupViews) + " of page views" },
    { label: "Completed signup", value: completed, note: pct(completed, signupViews) + " of page views" },
  ];

  const noData = rows.length === 0;

  return (
    <section className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 print:hidden">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--fl-text)]">Signup Funnel</h2>
        <span className="text-xs font-semibold text-[var(--fl-faint)]">last 30 days</span>
      </div>
      <p className="mb-4 text-xs text-[var(--fl-muted)]">
        Traffic vs. conversion. Few homepage/signup views = a traffic problem;
        lots of views but few completions = a conversion problem.
      </p>

      {noData ? (
        <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-sm text-[var(--fl-muted)]">
          No funnel events recorded yet. Data starts collecting now that tracking
          is live — check back after the marketing homepage / signup page get
          some visits.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {steps.map((s) => {
              const width = homeViews > 0 ? Math.max(4, Math.round((s.value / homeViews) * 100)) : 100;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-44 shrink-0 text-sm text-[var(--fl-text)]">{s.label}</div>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-[var(--fl-ground)]">
                    <div
                      className="h-full rounded-lg bg-teal-500/30"
                      style={{ width: `${width}%` }}
                    />
                    <div className="absolute inset-0 flex items-center gap-2 px-3">
                      <span className="text-sm font-bold text-[var(--fl-text)]">{s.value}</span>
                      <span className="text-xs text-[var(--fl-muted)]">{s.note}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Completed (30d)" value={String(completed)} />
            <Stat label="Completed (7d)" value={String(completed7)} />
            <Stat
              label="Signup-page → signup"
              value={pct(completed, signupViews)}
              sub={`${completed}/${signupViews}`}
            />
            <Stat
              label="Signup views (7d)"
              value={String(signupViews7)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2.5">
      <div className="text-xs font-semibold text-[var(--fl-muted)]">{label}</div>
      <div className="text-xl font-bold text-[var(--fl-text)]">{value}</div>
      {sub && <div className="text-[11px] text-[var(--fl-faint)]">{sub}</div>}
    </div>
  );
}

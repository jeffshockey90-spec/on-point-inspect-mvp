"use client";

import dynamic from "next/dynamic";

// Lazy wrapper so the heavy FullCalendar packages (core + daygrid + timegrid +
// interaction) are code-split out of the /schedule route's first-paint bundle
// and only load once the page has rendered. app/schedule/page.tsx is a server
// component, so the next/dynamic call has to live in this "use client" file.
const ScheduleCalendar = dynamic(() => import("./ScheduleCalendar"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] text-sm font-semibold text-[var(--fl-muted)]">
      Loading calendar…
    </div>
  ),
});

export default function ScheduleCalendarLazy(props: { inspections: any[] }) {
  return <ScheduleCalendar {...props} />;
}

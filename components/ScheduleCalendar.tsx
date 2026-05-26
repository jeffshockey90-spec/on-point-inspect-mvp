"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";

export default function ScheduleCalendar({
  inspections,
}: {
  inspections: any[];
}) {
  const router = useRouter();

  const events = inspections.map((inspection) => {
    const date =
      inspection.inspection_date ||
      inspection.scheduled_date;

    const time =
      inspection.inspection_time ||
      inspection.scheduled_time ||
      "09:00";

    const address =
      inspection.property_address ||
      inspection.address ||
      "Inspection";

    const client =
      inspection.client_name ||
      inspection.client ||
      "";

    return {
      id: inspection.id,
      title: `${address}${client ? ` — ${client}` : ""}`,
      start: `${date}T${time}`,
      allDay: false,
    };
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <FullCalendar
        plugins={[
          dayGridPlugin,
          timeGridPlugin,
          interactionPlugin,
        ]}
        initialView="timeGridWeek"
        height="auto"
        events={events}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        eventClick={(info) => {
          router.push(`/reports/${info.event.id}`);
        }}
      />
    </div>
  );
}
"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";

type InspectionRow = Record<string, any>;

function getInspectionDate(inspection: InspectionRow) {
  return (
    inspection.inspection_date ||
    inspection.scheduled_date ||
    inspection.date ||
    inspection.start_date ||
    null
  );
}

function getInspectionTime(inspection: InspectionRow) {
  return (
    inspection.inspection_time ||
    inspection.scheduled_time ||
    inspection.time ||
    inspection.start_time ||
    "09:00"
  );
}

function cleanDate(value: any) {
  if (!value) return "";

  const text = String(value).trim();

  if (text.includes("T")) {
    return text.split("T")[0];
  }

  return text;
}

function cleanTime(value: any) {
  if (!value) return "09:00";

  const text = String(value).trim();

  if (text.includes("T")) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      return date.toTimeString().slice(0, 5);
    }
  }

  if (/^\d{1,2}:\d{2}/.test(text)) {
    return text.slice(0, 5);
  }

  return "09:00";
}

function formatTime(value: any) {
  const time = cleanTime(value);
  const [hoursRaw, minutesRaw] = time.split(":");

  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return "";
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAddress(inspection: InspectionRow) {
  const parts = [
    inspection.address ||
      inspection.property_address ||
      inspection.street ||
      inspection.location,
    inspection.city,
    inspection.state,
    inspection.zip || inspection.zip_code,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Inspection";
}

function getClient(inspection: InspectionRow) {
  return (
    inspection.client_name ||
    inspection.client ||
    inspection.buyer_name ||
    inspection.customer_name ||
    inspection.customer ||
    ""
  );
}

function getRealtor(inspection: InspectionRow) {
  return (
    inspection.realtor_name ||
    inspection.agent_name ||
    inspection.realtor ||
    inspection.agent ||
    inspection.buyers_agent ||
    inspection.listing_agent ||
    ""
  );
}

function getStatus(inspection: InspectionRow) {
  return inspection.status || inspection.inspection_status || "Scheduled";
}

function getType(inspection: InspectionRow) {
  return inspection.inspection_type || inspection.type || "";
}

function statusColors(status: string) {
  const lower = status.toLowerCase();

  if (lower.includes("complete") || lower.includes("done")) {
    return {
      backgroundColor: "#064e3b",
      borderColor: "#34d399",
      textColor: "#d1fae5",
    };
  }

  if (lower.includes("cancel")) {
    return {
      backgroundColor: "#7f1d1d",
      borderColor: "#f87171",
      textColor: "#fee2e2",
    };
  }

  if (lower.includes("draft") || lower.includes("pending")) {
    return {
      backgroundColor: "#713f12",
      borderColor: "#facc15",
      textColor: "#fef9c3",
    };
  }

  return {
    backgroundColor: "#134e4a",
    borderColor: "#2dd4bf",
    textColor: "#ccfbf1",
  };
}

export default function ScheduleCalendar({
  inspections,
}: {
  inspections: any[];
}) {
  const router = useRouter();

  const events = inspections
    .map((inspection) => {
      const date = cleanDate(getInspectionDate(inspection));

      if (!date) return null;

      const time = cleanTime(getInspectionTime(inspection));
      const displayTime = formatTime(time);
      const address = getAddress(inspection);
      const client = getClient(inspection);
      const realtor = getRealtor(inspection);
      const status = getStatus(inspection);
      const type = getType(inspection);
      const colors = statusColors(status);

      return {
        id: String(inspection.id),
        title: `${displayTime} • ${address}${client ? ` — ${client}` : ""}`,
        start: `${date}T${time}`,
        allDay: false,
        backgroundColor: colors.backgroundColor,
        borderColor: colors.borderColor,
        textColor: colors.textColor,
        extendedProps: {
          address,
          client,
          realtor,
          status,
          type,
          time: displayTime,
        },
      };
    })
    .filter(Boolean) as any[];

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-cyan-100">
          Scheduled
        </span>
        <span className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 text-yellow-100">
          Pending / Draft
        </span>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-100">
          Completed
        </span>
        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-red-100">
          Cancelled
        </span>
      </div>

      <div className="schedule-calendar">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="78vh"
          events={events}
          eventDisplay="block"
          nowIndicator={true}
          dayMaxEvents={6}
          navLinks={true}
          stickyHeaderDates={true}
          slotMinTime="06:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={false}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          buttonText={{
            today: "Today",
            month: "Month",
            week: "Week",
            day: "Day",
          }}
          eventClick={(info) => {
            router.push(`/reports/${info.event.id}`);
          }}
          eventDidMount={(info) => {
            const props = info.event.extendedProps as any;

            info.el.title = [
              props.time,
              props.address,
              props.client ? `Client: ${props.client}` : "",
              props.realtor ? `Realtor: ${props.realtor}` : "",
              props.type ? `Type: ${props.type}` : "",
              props.status ? `Status: ${props.status}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          }}
          eventContent={(eventInfo) => {
            const props = eventInfo.event.extendedProps as any;

            return (
              <div className="leading-tight">
                <div className="truncate text-[11px] font-black sm:text-xs">
                  {props.time} • {props.address}
                </div>

                <div className="truncate text-[10px] opacity-90 sm:text-[11px]">
                  {props.client || "Client not entered"}
                </div>

                <div className="truncate text-[10px] opacity-80 sm:text-[11px]">
                  {props.status}
                  {props.type ? ` • ${props.type}` : ""}
                </div>
              </div>
            );
          }}
        />
      </div>

      <style jsx global>{`
        .schedule-calendar .fc {
          color: white;
          font-size: 13px;
        }

        .schedule-calendar .fc-theme-standard td,
        .schedule-calendar .fc-theme-standard th,
        .schedule-calendar .fc-theme-standard .fc-scrollgrid {
          border-color: rgba(63, 63, 70, 0.9);
        }

        .schedule-calendar .fc-toolbar-title {
          color: white;
          font-size: 1.1rem;
          font-weight: 800;
        }

        @media (min-width: 640px) {
          .schedule-calendar .fc-toolbar-title {
            font-size: 1.5rem;
          }
        }

        .schedule-calendar .fc-button {
          border-radius: 0.75rem !important;
          border-color: rgba(45, 212, 191, 0.35) !important;
          background: rgba(20, 184, 166, 0.14) !important;
          color: rgb(204, 251, 241) !important;
          font-weight: 800 !important;
          box-shadow: none !important;
        }

        .schedule-calendar .fc-button:hover,
        .schedule-calendar .fc-button-active {
          background: rgba(20, 184, 166, 0.28) !important;
        }

        .schedule-calendar .fc-daygrid-day-number,
        .schedule-calendar .fc-col-header-cell-cushion {
          color: rgb(212, 212, 216);
          text-decoration: none;
        }

        .schedule-calendar .fc-day-today {
          background: rgba(20, 184, 166, 0.08) !important;
        }

        .schedule-calendar .fc-event {
          cursor: pointer;
          border-radius: 0.6rem;
          padding: 2px 4px;
          transition: transform 0.12s ease, opacity 0.12s ease;
        }

        .schedule-calendar .fc-event:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .schedule-calendar .fc-daygrid-more-link {
          color: rgb(45, 212, 191);
          font-weight: 800;
        }

        @media (max-width: 640px) {
          .schedule-calendar .fc-header-toolbar {
            align-items: stretch;
            flex-direction: column;
            gap: 0.75rem;
          }

          .schedule-calendar .fc-toolbar-chunk {
            display: flex;
            justify-content: center;
          }

          .schedule-calendar .fc-button {
            padding: 0.35rem 0.55rem !important;
            font-size: 0.75rem !important;
          }

          .schedule-calendar .fc {
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InspectionRow = Record<string, any>;

type SelectedEvent = {
  id: string;
  address: string;
  client: string;
  realtor: string;
  status: string;
  type: string;
  date: string;
  time: string;
};

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
  return inspection.inspection_type || inspection.type || "Home Inspection";
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function typeColors(type: string, status: string) {
  const lowerStatus = status.toLowerCase();
  const lowerType = type.toLowerCase();

  if (lowerStatus.includes("complete") || lowerStatus.includes("done")) {
    return {
      backgroundColor: "#064e3b",
      borderColor: "#34d399",
      textColor: "#d1fae5",
    };
  }

  if (lowerStatus.includes("cancel")) {
    return {
      backgroundColor: "#7f1d1d",
      borderColor: "#f87171",
      textColor: "#fee2e2",
    };
  }

  if (lowerType.includes("radon")) {
    return {
      backgroundColor: "#4c1d95",
      borderColor: "#a78bfa",
      textColor: "#ede9fe",
    };
  }

  if (lowerType.includes("mold")) {
    return {
      backgroundColor: "#7c2d12",
      borderColor: "#fb923c",
      textColor: "#ffedd5",
    };
  }

  if (lowerType.includes("reinspect") || lowerType.includes("re-inspect")) {
    return {
      backgroundColor: "#1e3a8a",
      borderColor: "#60a5fa",
      textColor: "#dbeafe",
    };
  }

  if (lowerType.includes("commercial")) {
    return {
      backgroundColor: "#881337",
      borderColor: "#fb7185",
      textColor: "#ffe4e6",
    };
  }

  if (lowerStatus.includes("draft") || lowerStatus.includes("pending")) {
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
  const [selected, setSelected] = useState<SelectedEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const events = useMemo(() => {
    return inspections
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
        const colors = typeColors(type, status);

        return {
          id: String(inspection.id),
          title: `${displayTime} ${address}`,
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
            date,
            time,
            displayTime,
          },
        };
      })
      .filter(Boolean) as any[];
  }, [inspections]);

  const todaysEvents = useMemo(() => {
    const today = todayKey();

    return events
      .filter((event) => event.extendedProps.date === today)
      .sort((a, b) =>
        String(a.extendedProps.time).localeCompare(String(b.extendedProps.time))
      );
  }, [events]);

  async function saveScheduleUpdate(eventToSave: SelectedEvent) {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/inspections/update-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId: eventToSave.id,
          inspection_date: eventToSave.date,
          inspection_time: eventToSave.time,
          status: eventToSave.status,
        }),
      });

      if (!response.ok) {
        throw new Error("Schedule update failed");
      }

      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteInspection() {
    if (!selected) return;

    const confirmed = window.confirm(
      "Delete this inspection? This cannot be undone."
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/inspections/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId: selected.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setSelected(null);
      router.refresh();
    } catch (error) {
      setMessage("Could not delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="mb-4 grid gap-4 lg:grid-cols-[1.1fr_2fr]">
        <div className="rounded-2xl border border-teal-400/20 bg-black/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-white">Today</h2>
            <span className="rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-100">
              {todaysEvents.length}
            </span>
          </div>

          {todaysEvents.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">
              No inspections scheduled for today.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {todaysEvents.slice(0, 5).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    const props = event.extendedProps as any;

                    setSelected({
                      id: event.id,
                      address: props.address,
                      client: props.client,
                      realtor: props.realtor,
                      status: props.status,
                      type: props.type,
                      date: props.date,
                      time: props.time,
                    });
                  }}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-left transition hover:border-teal-400/40 hover:bg-zinc-800"
                >
                  <p className="text-sm font-black text-teal-200">
                    {event.extendedProps.displayTime}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-white">
                    {event.extendedProps.address}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-400">
                    {event.extendedProps.client || "Client not entered"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap content-start gap-2 text-xs font-bold">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-cyan-100">
            Home Inspection
          </span>
          <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-purple-100">
            Radon
          </span>
          <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-orange-100">
            Mold
          </span>
          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-blue-100">
            Reinspection
          </span>
          <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-rose-100">
            Commercial
          </span>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-100">
            Completed
          </span>
          <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-red-100">
            Cancelled
          </span>
        </div>
      </div>

      <div className="schedule-calendar">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="78vh"
          events={events}
          eventDisplay="block"
          nowIndicator={true}
          editable={true}
          eventStartEditable={true}
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
          eventDrop={async (info) => {
            const start = info.event.start;

            if (!start) {
              info.revert();
              return;
            }

            const date = start.toISOString().split("T")[0];
            const time = start.toTimeString().slice(0, 5);

            try {
              const response = await fetch("/api/inspections/update-schedule", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  inspectionId: info.event.id,
                  inspection_date: date,
                  inspection_time: time,
                  status: info.event.extendedProps.status || "Scheduled",
                }),
              });

              if (!response.ok) {
                throw new Error("Update failed");
              }

              router.refresh();
            } catch (error) {
              info.revert();
              alert("Could not move this appointment. Please try again.");
            }
          }}
          eventClick={(info) => {
            const props = info.event.extendedProps as any;

            setSelected({
              id: info.event.id,
              address: props.address,
              client: props.client,
              realtor: props.realtor,
              status: props.status,
              type: props.type,
              date: props.date,
              time: props.time,
            });
          }}
          eventDidMount={(info) => {
            const props = info.event.extendedProps as any;

            info.el.title = [
              props.displayTime,
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
                  {props.displayTime}
                </div>

                <div className="truncate text-[10px] font-bold sm:text-[11px]">
                  {props.address}
                </div>

                <div className="truncate text-[10px] opacity-90 sm:text-[11px]">
                  {props.client || "Client not entered"}
                </div>
              </div>
            );
          }}
        />
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">
                  Edit Appointment
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {selected.address}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setMessage("");
                }}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Date
                </span>
                <input
                  type="date"
                  value={selected.date}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      date: event.target.value,
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Time
                </span>
                <input
                  type="time"
                  value={selected.time}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      time: event.target.value,
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white outline-none focus:border-teal-400"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Status
              </span>
              <select
                value={selected.status}
                onChange={(event) =>
                  setSelected({
                    ...selected,
                    status: event.target.value,
                  })
                }
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white outline-none focus:border-teal-400"
              >
                <option>Scheduled</option>
                <option>Pending</option>
                <option>Draft</option>
                <option>Completed</option>
                <option>Cancelled</option>
              </select>
            </label>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-black/40 p-4">
              <p className="text-sm font-bold text-white">
                {selected.client || "Client not entered"}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Realtor: {selected.realtor || "Not entered"}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Type: {selected.type || "Home Inspection"}
              </p>
            </div>

            {message ? (
              <p className="mt-4 rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200">
                {message}
              </p>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => saveScheduleUpdate(selected)}
                className="rounded-xl bg-teal-500 px-4 py-3 text-sm font-black text-black transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                onClick={() => router.push(`/reports/${selected.id}`)}
                className="rounded-xl border border-teal-400/30 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-100 transition hover:bg-teal-500/20"
              >
                Open Report
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={deleteInspection}
                className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

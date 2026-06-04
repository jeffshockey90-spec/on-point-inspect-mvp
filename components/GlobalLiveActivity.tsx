"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";

type InspectionSummary = {
  id: string | number;
  property_address?: string | null;
  address?: string | null;
};

type LiveEvent = {
  id?: string;
  inspection_id_bigint?: number | string | null;
  inspection_id?: number | string | null;
  view_type?: string | null;
  viewer_role?: string | null;
  viewer_email?: string | null;
  created_at?: string | null;
  metadata?: any;
};

function getViewType(log: LiveEvent) {
  return String(log?.view_type || "").toLowerCase();
}

function shouldShowEvent(log: LiveEvent) {
  return [
    "client_portal",
    "report_share",
    "environmental_share",
    "email_open",
    "email_click",
    "agreement_page",
    "agreement_signed",
    "payment_received",
    "report_time_final",
  ].includes(getViewType(log));
}

function getViewerLabel(log: LiveEvent) {
  const role = String(log?.viewer_role || "").trim().toLowerCase();
  const email = String(log?.viewer_email || "").trim();

  if (email) return email;
  if (role === "client") return "Client";
  if (role === "realtor" || role === "agent") return "Realtor";
  if (role === "transaction coordinator") return "Transaction Coordinator";
  if (role === "inspector") return "Inspector";
  if (role === "system") return "System";

  return "Viewer";
}

function getActivityTitle(log: LiveEvent) {
  const type = getViewType(log);
  const viewer = getViewerLabel(log);

  if (type === "client_portal") return `${viewer} opened the client portal`;
  if (type === "report_share") return `${viewer} viewed the report`;
  if (type === "environmental_share") return `${viewer} viewed the environmental report`;
  if (type === "email_open") return `${viewer} opened an email`;
  if (type === "email_click") return `${viewer} clicked a report link`;
  if (type === "agreement_page") return `${viewer} opened the agreement page`;
  if (type === "agreement_signed") return `${viewer} signed the agreement`;
  if (type === "payment_received") return "Payment received";
  if (type === "report_time_final") return `${viewer} finished reading the report`;

  return `${viewer} activity recorded`;
}

function getActivityIcon(log: LiveEvent) {
  const type = getViewType(log);

  if (type === "client_portal") return "🔐";
  if (type === "report_share") return "📋";
  if (type === "environmental_share") return "🧪";
  if (type === "email_open") return "📬";
  if (type === "email_click") return "👆";
  if (type === "agreement_page") return "📝";
  if (type === "agreement_signed") return "✅";
  if (type === "payment_received") return "💰";
  if (type === "report_time_final") return "⏱️";

  return "🔔";
}

function formatMoney(value: any) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function GlobalLiveActivity() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [inspections, setInspections] = useState<InspectionSummary[]>([]);
  const [latestEvent, setLatestEvent] = useState<LiveEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const inspectionMap = useMemo(() => {
    const map = new Map<string, InspectionSummary>();

    inspections.forEach((inspection) => {
      map.set(String(inspection.id), inspection);
    });

    return map;
  }, [inspections]);

  const inspectionIds = useMemo(
    () => inspections.map((inspection) => String(inspection.id)),
    [inspections]
  );

  useEffect(() => {
    notificationSoundRef.current = new Audio("/sounds/notification.mp3");
    notificationSoundRef.current.preload = "auto";
    notificationSoundRef.current.volume = 0.65;
  }, []);

  useEffect(() => {
    function unlockSound() {
      setSoundEnabled(true);

      const audio = notificationSoundRef.current;
      if (!audio) return;

      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {});
    }

    window.addEventListener("pointerdown", unlockSound, { once: true });
    window.addEventListener("keydown", unlockSound, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };
  }, []);

  function playNotificationSound() {
    const audio = notificationSoundRef.current;

    if (!audio || !soundEnabled) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {
    let mounted = true;

    async function loadInspections() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("inspections")
        .select("id,address,property_address")
        .eq("inspector_id", user.id);

      if (!mounted) return;

      if (error) {
        console.error("Global live activity inspections load error:", error);
        return;
      }

      setInspections(data || []);
    }

    loadInspections();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (inspectionIds.length === 0) return;

    const channel = supabase
      .channel("global-live-report-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inspection_view_events",
        },
        (payload) => {
          const event = payload.new as LiveEvent;

          if (event.id && lastEventIdRef.current === event.id) return;
          lastEventIdRef.current = event.id || null;

          const inspectionId = String(
            event?.inspection_id_bigint || event?.inspection_id || ""
          );

          if (!inspectionId || !inspectionIds.includes(inspectionId)) return;
          if (!shouldShowEvent(event)) return;

          playNotificationSound();

          setLatestEvent(event);
          setVisible(true);

          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => {
            setVisible(false);
          }, 7000);

        }
      )
      .subscribe();

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [inspectionIds, router, supabase, soundEnabled]);

  if (!latestEvent || !visible) return null;

  const inspectionId = String(
    latestEvent.inspection_id_bigint || latestEvent.inspection_id || ""
  );

  const inspection = inspectionMap.get(inspectionId);

  const address =
    inspection?.property_address ||
    inspection?.address ||
    "Inspection report";

  const paymentAmount = formatMoney(
    latestEvent.metadata?.amount_paid ||
      latestEvent.metadata?.total_charged ||
      0
  );

  return (
    <div className="fixed bottom-24 right-5 z-[9999] w-[calc(100vw-2.5rem)] max-w-md rounded-2xl border border-teal-500/50 bg-[#020617] p-4 text-white shadow-2xl shadow-black/40 md:bottom-5">
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-2xl">
          {getActivityIcon(latestEvent)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                Live Activity
              </p>

              <p className="mt-1 font-black text-white">
                {getActivityTitle(latestEvent)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVisible(false)}
              className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-black text-slate-300 transition hover:border-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>

          <p className="mt-2 truncate text-sm text-slate-400">{address}</p>

          {getViewType(latestEvent) === "payment_received" && paymentAmount && (
            <p className="mt-1 text-sm font-black text-green-300">
              Amount: {paymentAmount}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {inspectionId && (
              <a
                href={`/reports/${inspectionId}`}
                className="rounded-lg bg-teal-500 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-teal-400"
              >
                Open Report
              </a>
            )}

            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-teal-400 hover:text-teal-300"
            >
              Refresh
            </button>

            {!soundEnabled && (
              <button
                type="button"
                onClick={() => setSoundEnabled(true)}
                className="rounded-lg border border-yellow-500/50 px-3 py-2 text-xs font-black text-yellow-300 transition hover:bg-yellow-500/10"
              >
                Enable Sound
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

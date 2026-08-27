"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../utils/supabase/client";
import { formatMoney as formatMoneyLocale } from "../lib/locale";

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
    "review_submitted",
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
  if (type === "review_submitted") return "Review submitted";

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
  if (type === "review_submitted") return "⭐";

  return "🔔";
}

function formatMoney(value: any, currency = "USD") {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) return "";

  return formatMoneyLocale(amount, currency);
}

function maybeShowBrowserNotification(title: string, body: string, url: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    });

    notification.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      notification.close();
    };
  } catch {}
}

const INSPECTION_CACHE_KEY = "onpoint_live_activity_inspections";
const INSPECTION_CACHE_TTL_MS = 1000 * 60 * 5;

function readInspectionCache() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(INSPECTION_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > INSPECTION_CACHE_TTL_MS) {
      return null;
    }

    return Array.isArray(parsed?.items) ? parsed.items : null;
  } catch {
    return null;
  }
}

function writeInspectionCache(items: InspectionSummary[]) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      INSPECTION_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), items })
    );
  } catch {}
}

export default function GlobalLiveActivity() {
  const supabase = useMemo(() => createClient(), []);

  const [inspections, setInspections] = useState<InspectionSummary[]>([]);
  const [latestEvent, setLatestEvent] = useState<LiveEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [currency, setCurrency] = useState<string>("USD");
  const [liveActivityEnabled, setLiveActivityEnabled] = useState(true);
  const [liveActivitySoundEnabled, setLiveActivitySoundEnabled] = useState(true);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  // Suppress repeat alerts for the same viewer opening the same report within a
  // short window, so a client reloading their report doesn't spam sound/toasts.
  const lastAlertRef = useRef<Map<string, number>>(new Map());

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
    let mounted = true;

    async function loadLiveActivitySettings() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (!user) {
          setSettingsLoaded(true);
          setLiveActivityEnabled(false);
          setLiveActivitySoundEnabled(false);
          return;
        }

        const { data: companyUser } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;

        if (!companyUser?.company_id) {
          setSettingsLoaded(true);
          setCompanyId("");
          setLiveActivityEnabled(false);
          setLiveActivitySoundEnabled(false);
          return;
        }

        setCompanyId(String(companyUser.company_id));

        const { data: company, error } = await supabase
          .from("companies")
          .select("live_activity_enabled, live_activity_sound_enabled, currency")
          .eq("id", companyUser.company_id)
          .maybeSingle();

        if (!mounted) return;
        if (company?.currency) setCurrency(String(company.currency));

        if (error) {
          console.error("Live activity settings load error:", error);
          setSettingsLoaded(true);
          return;
        }

        const enabled = company?.live_activity_enabled !== false;
        setLiveActivityEnabled(enabled);
        setLiveActivitySoundEnabled(company?.live_activity_sound_enabled !== false);
        setSettingsLoaded(true);

        if (!enabled) {
          setVisible(false);
          setLatestEvent(null);
        }
      } catch (error) {
        console.error("Live activity settings failed:", error);
        if (mounted) setSettingsLoaded(true);
      }
    }

    loadLiveActivitySettings();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`company-live-activity-settings-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "companies",
          filter: `id=eq.${companyId}`,
        },
        (payload) => {
          const company = payload.new as any;
          const enabled = company?.live_activity_enabled !== false;

          setLiveActivityEnabled(enabled);
          setLiveActivitySoundEnabled(company?.live_activity_sound_enabled !== false);
          setSettingsLoaded(true);

          if (!enabled) {
            setVisible(false);
            setLatestEvent(null);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, supabase]);

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

    if (!audio || !soundEnabled || !liveActivitySoundEnabled) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {
    let mounted = true;

    async function loadInspections() {
      const cachedInspections = readInspectionCache();

      if (cachedInspections?.length) {
        setInspections(cachedInspections);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("inspections")
        .select("id,address,property_address")
        .eq("inspector_id", user.id)
        .order("created_at", { ascending: false })
        .limit(250);

      if (!mounted) return;

      if (error) {
        console.error("Global live activity inspections load error:", error);
        return;
      }

      const nextInspections = data || [];
      setInspections(nextInspections);
      writeInspectionCache(nextInspections);
    }

    loadInspections();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!settingsLoaded || !liveActivityEnabled) {
      setVisible(false);
      return;
    }

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
          if (!liveActivityEnabled) return;

          const event = payload.new as LiveEvent;

          if (event.id && lastEventIdRef.current === event.id) return;
          lastEventIdRef.current = event.id || null;

          const inspectionId = String(
            event?.inspection_id_bigint || event?.inspection_id || ""
          );

          if (!inspectionId || !inspectionIds.includes(inspectionId)) return;
          if (!shouldShowEvent(event)) return;

          // Throttle reloads: one alert per viewer + report + type per 30 min.
          // Payment/signed/review are one-time events, so never throttle those.
          const type = getViewType(event);
          const throttleable = ["client_portal", "report_share", "environmental_share"].includes(type);
          if (throttleable) {
            const viewer = String(event.viewer_email || event.viewer_role || "anon").toLowerCase();
            const key = `${inspectionId}|${type}|${viewer}`;
            const nowTs = Date.now();
            const last = lastAlertRef.current.get(key) || 0;
            if (nowTs - last < 30 * 60 * 1000) return; // reload within window -> stay quiet
            lastAlertRef.current.set(key, nowTs);
          }

          const inspection = inspectionMap.get(inspectionId);
          const address =
            inspection?.property_address ||
            inspection?.address ||
            "Inspection report";

          const title = getActivityTitle(event);

          playNotificationSound();
          maybeShowBrowserNotification(
            "FLOW",
            `${title} • ${address}`,
            `/reports/${inspectionId}`
          );

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
  }, [
    inspectionIds,
    inspectionMap,
    supabase,
    soundEnabled,
    settingsLoaded,
    liveActivityEnabled,
    liveActivitySoundEnabled,
  ]);

  if (!settingsLoaded || !liveActivityEnabled || !latestEvent || !visible) {
    return null;
  }

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
      0,
    currency,
  );

  return (
    <div className="fixed bottom-24 right-5 z-[9999] w-[calc(100vw-2.5rem)] max-w-md rounded-2xl border border-teal-500/50 bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] shadow-2xl shadow-black/40 md:bottom-5">
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-2xl">
          {getActivityIcon(latestEvent)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                Live Activity
              </p>

              <p className="mt-1 font-semibold text-[var(--fl-text)]">
                {getActivityTitle(latestEvent)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVisible(false)}
              className="rounded-lg border border-[var(--fl-line)] px-2 py-1 text-xs font-semibold text-[var(--fl-muted)] transition hover:border-red-400 hover:text-[var(--fl-crit-text)]"
            >
              ✕
            </button>
          </div>

          <p className="mt-2 truncate text-sm text-[var(--fl-muted)]">{address}</p>

          {getViewType(latestEvent) === "payment_received" && paymentAmount && (
            <p className="mt-1 text-sm font-semibold text-[var(--fl-good-text)]">
              Amount: {paymentAmount}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {inspectionId && (
              <a
                href={`/reports/${inspectionId}`}
                className="rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-400"
              >
                Open Report
              </a>
            )}

            {!soundEnabled && (
              <button
                type="button"
                onClick={() => setSoundEnabled(true)}
                className="rounded-lg border border-yellow-500/50 px-3 py-2 text-xs font-semibold text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10"
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

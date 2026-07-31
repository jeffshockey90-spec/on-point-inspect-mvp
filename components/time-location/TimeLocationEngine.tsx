"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectDeviceTimeZone, inspectionLocalToUtc, writeStoredTimePreferences } from "../../lib/app-time";

type Inspection = { id: string; property_address?: string; property_latitude?: number | null; property_longitude?: number | null; scheduled_start_at?: string | null; inspection_date?: string | null; inspection_time?: string | null; scheduled_date?: string | null; scheduled_time?: string | null; status?: string | null };
type ActiveTrip = { id: string; inspection_id?: string | null; total_miles?: number } | null;
type PresenceSession = { id: string; inspection_id: string; arrived_at?: string | null; departed_at?: string | null; geofence_radius_meters?: number; inspections?: Inspection | null } | null;

const ACTION_TYPE = "ONPOINT_DEPARTURE";
const START_ACTION = "START_MILEAGE";
const NOT_YET_ACTION = "NOT_YET";
const STATE_KEY = "onpoint-time-location-runtime";

function isNative() { return typeof window !== "undefined" && Boolean((window as any).Capacitor?.isNativePlatform?.()); }
function hashId(value: string, seed = 17) { return Math.abs(Array.from(value).reduce((n, c) => ((n * 31 + c.charCodeAt(0)) | 0), seed)) || seed; }
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(x));
}
function inspectionStart(i: Inspection, zone: string) {
  if (i.scheduled_start_at) { const d = new Date(i.scheduled_start_at); if (!Number.isNaN(d.getTime())) return d; }
  const date = i.inspection_date || i.scheduled_date;
  const time = i.inspection_time || i.scheduled_time;
  if (!date || !time) return null;
  try { return new Date(inspectionLocalToUtc(String(date).slice(0, 10), String(time).slice(0, 5), zone)); } catch { return null; }
}

export default function TimeLocationEngine() {
  const [activeTrip, setActiveTrip] = useState<ActiveTrip>(null);
  const [presence, setPresence] = useState<PresenceSession>(null);
  const watchId = useRef<number | string | null>(null);
  const lastPointSent = useRef(0);
  const insideCount = useRef(0);
  const outsideCount = useRef(0);
  const departurePrompted = useRef(false);

  const syncTimeZone = useCallback(async () => {
    const deviceTimeZone = detectDeviceTimeZone();
    try {
      const current = await fetch("/api/settings/time-preferences", { cache: "no-store" }).then(r => r.ok ? r.json() : null);
      if (!current) return;
      if (current.deviceTimeZone !== deviceTimeZone || current.timeZone !== deviceTimeZone) {
        await fetch("/api/settings/time-preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeZone: deviceTimeZone, deviceTimeZone, timeFormat: current.timeFormat || "24h" }) });
      }
      writeStoredTimePreferences({ timeZone: deviceTimeZone, timeFormat: current.timeFormat || "24h" });
    } catch {}
  }, []);

  const loadState = useCallback(async () => {
    try {
      const [mileage, session] = await Promise.all([
        fetch("/api/mileage", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
        fetch("/api/inspection-presence", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
      ]);
      setActiveTrip(mileage?.active || null);
      setPresence(session?.session || null);
    } catch {}
  }, []);

  const startMileage = useCallback(async (inspectionId?: string, coords?: { latitude: number; longitude: number }) => {
    const response = await fetch("/api/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", inspectionId: inspectionId || null, purpose: "Travel after inspection", latitude: coords?.latitude, longitude: coords?.longitude }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok || response.status === 409) {
      if (response.ok) setActiveTrip(data.trip);
      await fetch("/api/inspection-presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_mileage", mileageStartedAt: new Date().toISOString() }) }).catch(() => null);
      setPresence(null);
      departurePrompted.current = false;
      localStorage.removeItem(STATE_KEY);
    }
  }, []);

  const getCoords = useCallback(async () => {
    if (!navigator.geolocation) return undefined;
    try {
      const p = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }));
      return { latitude: p.coords.latitude, longitude: p.coords.longitude };
    } catch { return undefined; }
  }, []);

  const promptDeparture = useCallback(async (session: NonNullable<PresenceSession>, coords: { latitude: number; longitude: number }) => {
    if (departurePrompted.current || activeTrip?.id) return;
    departurePrompted.current = true;
    localStorage.setItem(STATE_KEY, JSON.stringify({ pendingDeparture: true, inspectionId: session.inspection_id, at: new Date().toISOString() }));
    await fetch("/api/inspection-presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "depart", latitude: coords.latitude, longitude: coords.longitude, recordedAt: new Date().toISOString() }) }).catch(() => null);
    if (isNative()) {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.schedule({ notifications: [{ id: hashId(`departure-${session.inspection_id}`), title: "Leaving the inspection?", body: `Start mileage tracking after ${session.inspections?.property_address || "this inspection"}?`, actionTypeId: ACTION_TYPE, schedule: { at: new Date(Date.now() + 500) }, extra: { eventType: "inspection_departure", inspectionId: session.inspection_id, url: "/mileage" } }] });
        return;
      } catch {}
    }
    window.dispatchEvent(new CustomEvent("onpoint:departure-confirmation", { detail: { inspectionId: session.inspection_id } }));
    if (window.confirm("Leaving the inspection? Start mileage tracking now?")) await startMileage(session.inspection_id, coords);
    else departurePrompted.current = false;
  }, [activeTrip?.id, startMileage]);

  const ensurePresenceForUpcoming = useCallback(async () => {
    if (presence) return;
    try {
      const [payload, prefs, settings] = await Promise.all([
        fetch("/api/native/upcoming-inspections", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
        fetch("/api/settings/time-preferences", { cache: "no-store" }).then(r => r.ok ? r.json() : ({ timeZone: detectDeviceTimeZone() })),
        fetch("/api/settings/schedule-reminders", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
      ]);
      if (settings?.arrival_detection_enabled === false || settings?.departure_detection_enabled === false) return;
      const now = Date.now();
      const inspections: Inspection[] = payload?.inspections || [];
      const candidate = inspections.map(i => ({ i, start: inspectionStart(i, prefs.timeZone) })).filter(x => x.start && Number.isFinite(Number(x.i.property_latitude)) && Number.isFinite(Number(x.i.property_longitude)) && x.start!.getTime() >= now - 4 * 3600000 && x.start!.getTime() <= now + 8 * 3600000).sort((a,b) => Math.abs(a.start!.getTime()-now)-Math.abs(b.start!.getTime()-now))[0];
      if (!candidate) return;
      const res = await fetch("/api/inspection-presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", inspectionId: candidate.i.id, radiusMeters: settings?.geofence_radius_meters || 220 }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPresence({ ...data.session, inspections: candidate.i });
    } catch {}
  }, [presence]);

  useEffect(() => {
    syncTimeZone(); loadState();
    const refresh = () => { syncTimeZone(); loadState(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(refresh, 15 * 60000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); clearInterval(timer); };
  }, [syncTimeZone, loadState]);

  useEffect(() => { ensurePresenceForUpcoming(); }, [ensurePresenceForUpcoming]);

  useEffect(() => {
    if (!isNative()) return;
    let actionListener: any;
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.registerActionTypes({ types: [{ id: ACTION_TYPE, actions: [{ id: START_ACTION, title: "Start Mileage" }, { id: NOT_YET_ACTION, title: "Not Yet", destructive: false }] }] });
        actionListener = await LocalNotifications.addListener("localNotificationActionPerformed", async event => {
          const action = event.actionId;
          const inspectionId = String(event.notification?.extra?.inspectionId || presence?.inspection_id || "");
          if (action === START_ACTION || action === "tap") await startMileage(inspectionId, await getCoords());
          else if (action === NOT_YET_ACTION) { departurePrompted.current = false; await fetch("/api/inspection-presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss_departure" }) }).catch(() => null); }
        });
      } catch {}
    })();
    return () => { try { actionListener?.remove?.(); } catch {} };
  }, [getCoords, presence?.inspection_id, startMileage]);

  useEffect(() => {
    const i = presence?.inspections;
    const lat = Number(i?.property_latitude), lng = Number(i?.property_longitude);
    if (!presence?.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const enterRadius = Math.max(100, Number(presence.geofence_radius_meters || 220));
    const exitRadius = Math.max(enterRadius + 120, enterRadius * 1.8);
    let stopped = false;
    let nativeWatchId: string | null = null;

    const handleLocation = async (raw: any) => {
      const latitude = Number(raw?.latitude ?? raw?.coords?.latitude);
      const longitude = Number(raw?.longitude ?? raw?.coords?.longitude);
      const accuracy = Number(raw?.accuracy ?? raw?.coords?.accuracy ?? 999);
      const timestamp = Number(raw?.time ?? raw?.timestamp ?? Date.now());
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || accuracy > 150 || stopped) return;
      const coords = { latitude, longitude };
      const meters = distanceMeters(latitude, longitude, lat, lng);
      if (meters <= enterRadius) { insideCount.current += 1; outsideCount.current = 0; }
      else if (meters >= exitRadius) { outsideCount.current += 1; insideCount.current = 0; }
      else { insideCount.current = 0; outsideCount.current = 0; }
      if (!presence.arrived_at && insideCount.current >= 2) {
        const at = new Date(timestamp).toISOString();
        await fetch("/api/inspection-presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "arrive", ...coords, recordedAt: at }) });
        setPresence(current => current ? { ...current, arrived_at: at } : current);
      }
      if (presence.arrived_at && outsideCount.current >= 3) await promptDeparture(presence, coords);
      if (activeTrip?.id && Date.now() - lastPointSent.current >= 10000) {
        lastPointSent.current = Date.now();
        const r = await fetch("/api/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "point", tripId: activeTrip.id, ...coords, accuracy, recordedAt: new Date(timestamp).toISOString() }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && typeof d.totalMiles === "number") setActiveTrip(t => t ? { ...t, total_miles: d.totalMiles } : t);
      }
    };

    (async () => {
      if (isNative()) {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const permission = await Geolocation.checkPermissions();
          if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
            await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
          }
          nativeWatchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
            (position, error) => {
              if (!error && position) void handleLocation(position);
            },
          );
          return;
        } catch (error) {
          console.warn("Native geolocation unavailable; using browser geolocation.", error);
        }
      }
      if (!navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(position => void handleLocation(position), () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      watchId.current = id;
    })();

    return () => {
      stopped = true;
      if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(Number(watchId.current));
      watchId.current = null;
      if (nativeWatchId && isNative()) {
        import("@capacitor/geolocation")
          .then(({ Geolocation }) => Geolocation.clearWatch({ id: nativeWatchId! }))
          .catch(() => null);
      }
    };
  }, [presence, activeTrip?.id, getCoords, promptDeparture]);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const permission = await LocalNotifications.checkPermissions(); if (permission.display !== "granted") await LocalNotifications.requestPermissions();
        const [payload, prefs, settings] = await Promise.all([
          fetch("/api/native/upcoming-inspections", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
          fetch("/api/settings/time-preferences", { cache: "no-store" }).then(r => r.ok ? r.json() : ({ timeZone: detectDeviceTimeZone() })),
          fetch("/api/settings/schedule-reminders", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled || settings?.enabled === false) return;
        const notifications: any[] = [];
        for (const i of (payload?.inspections || []).slice(0, 50) as Inspection[]) {
          const start = inspectionStart(i, prefs.timeZone); if (!start) continue;
          const reminders = [{ m: 1440, on: settings?.reminder_24h_enabled !== false, title: "Inspection Tomorrow" }, { m: 120, on: settings?.reminder_2h_enabled !== false, title: "Inspection in 2 Hours" }, { m: 30, on: settings?.reminder_30m_enabled !== false, title: "Inspection in 30 Minutes" }];
          for (const r of reminders) { const at = new Date(start.getTime() - r.m * 60000); if (!r.on || at.getTime() <= Date.now()) continue; notifications.push({ id: hashId(`inspection-${i.id}-${r.m}`), title: r.title, body: i.property_address || "Upcoming inspection", schedule: { at }, extra: { eventType: `schedule_reminder_${r.m}`, inspectionId: i.id, url: `/reports/${i.id}` } }); }
        }
        if (settings?.radon_reminders_enabled !== false) {
          const radonPayload = await fetch("/api/native/upcoming-radon", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
          for (const test of (radonPayload?.tests || [])) {
            const address = test.inspections?.property_address || "Radon test";
            const events = [
              { key: "deploy", value: test.start_time, minutes: 30, title: "Radon Deployment in 30 Minutes", on: settings?.radon_deployment_reminder_enabled !== false },
              { key: "retrieve", value: test.end_time, minutes: 30, title: "Radon Retrieval in 30 Minutes", on: settings?.radon_retrieval_reminder_enabled !== false },
            ];
            for (const event of events) {
              if (!event.on || !event.value) continue;
              const instant = new Date(event.value);
              const at = new Date(instant.getTime() - event.minutes * 60000);
              if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) continue;
              notifications.push({ id: hashId(`radon-${test.id}-${event.key}`), title: event.title, body: address, schedule: { at }, extra: { eventType: `radon_${event.key}`, inspectionId: test.inspection_id, url: "/radon" } });
            }
          }
        }
        if (notifications.length) await LocalNotifications.schedule({ notifications });
      } catch (e) { console.warn("Local reminder scheduling unavailable", e); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const start = async (event: Event) => { const d = (event as CustomEvent).detail || {}; await startMileage(d.inspectionId, await getCoords()); };
    const stop = async () => { if (!activeTrip?.id) return; const c = await getCoords(); const r = await fetch("/api/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", tripId: activeTrip.id, latitude: c?.latitude, longitude: c?.longitude }) }); if (r.ok) setActiveTrip(null); };
    const pushAction = async (event: Event) => { const d = (event as CustomEvent).detail || {}; if (d.eventType === "inspection_departure_confirm" || d.actionId === START_ACTION) await startMileage(d.inspectionId || presence?.inspection_id, await getCoords()); };
    window.addEventListener("onpoint:mileage-start", start); window.addEventListener("onpoint:mileage-stop", stop); window.addEventListener("onpoint:push-action", pushAction);
    return () => { window.removeEventListener("onpoint:mileage-start", start); window.removeEventListener("onpoint:mileage-stop", stop); window.removeEventListener("onpoint:push-action", pushAction); };
  }, [activeTrip?.id, getCoords, presence?.inspection_id, startMileage]);

  return null;
}

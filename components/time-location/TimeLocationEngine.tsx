"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectDeviceTimeZone, inspectionLocalToUtc } from "../../lib/app-time";

type ActiveTrip = { id: string; inspection_id?: string | null; total_miles?: number; inspections?: { property_address?: string; property_latitude?: number | null; property_longitude?: number | null } | null } | null;

function nativePlatform() {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export default function TimeLocationEngine() {
  const [activeTrip, setActiveTrip] = useState<ActiveTrip>(null);
  const watchId = useRef<string | number | null>(null);
  const lastSent = useRef(0);
  const arrivedAtProperty = useRef(false);
  const departurePrompted = useRef(false);

  const syncTimeZone = useCallback(async () => {
    const deviceTimeZone = detectDeviceTimeZone();
    try {
      const current = await fetch("/api/settings/time-preferences", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
      if (!current) return;
      if (current.deviceTimeZone !== deviceTimeZone) {
        await fetch("/api/settings/time-preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeZone: deviceTimeZone, deviceTimeZone, timeFormat: current.timeFormat || "24h" }),
        });
      }
      window.localStorage.setItem("onpoint-time-preferences", JSON.stringify({ timeZone: deviceTimeZone, timeFormat: current.timeFormat || "24h" }));
    } catch {}
  }, []);

  const loadActiveTrip = useCallback(async () => {
    try {
      const data = await fetch("/api/mileage", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
      setActiveTrip(data?.active || null);
    } catch {}
  }, []);

  useEffect(() => { syncTimeZone(); loadActiveTrip(); }, [syncTimeZone, loadActiveTrip]);

  useEffect(() => {
    if (!activeTrip?.id || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(async (position) => {
      const now = Date.now();
      if (now - lastSent.current < 10000) return;
      lastSent.current = now;
      const targetLat = Number(activeTrip.inspections?.property_latitude);
      const targetLng = Number(activeTrip.inspections?.property_longitude);
      if (Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
        const toRad = (value: number) => value * Math.PI / 180;
        const dLat = toRad(position.coords.latitude - targetLat);
        const dLng = toRad(position.coords.longitude - targetLng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(targetLat)) * Math.cos(toRad(position.coords.latitude)) * Math.sin(dLng / 2) ** 2;
        const milesFromProperty = 3958.7613 * 2 * Math.asin(Math.sqrt(a));
        if (milesFromProperty <= 0.12) arrivedAtProperty.current = true;
        if (arrivedAtProperty.current && milesFromProperty >= 0.25 && !departurePrompted.current && nativePlatform()) {
          departurePrompted.current = true;
          try {
            const { LocalNotifications } = await import("@capacitor/local-notifications");
            await LocalNotifications.schedule({ notifications: [{
              id: Math.abs(Array.from(activeTrip.id).reduce((n, c) => ((n * 31 + c.charCodeAt(0)) | 0), 11)) || 11,
              title: "Leaving the inspection?",
              body: "Mileage is still tracking. Open the app to continue the return trip or end the mileage trip.",
              schedule: { at: new Date(Date.now() + 1000) },
              extra: { url: "/mileage", tripId: activeTrip.id },
            }] });
          } catch {}
        }
      }
      try {
        const response = await fetch("/api/mileage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "point",
            tripId: activeTrip.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            recordedAt: new Date(position.timestamp).toISOString(),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && typeof data.totalMiles === "number") setActiveTrip((trip) => trip ? { ...trip, total_miles: data.totalMiles } : trip);
      } catch {}
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    watchId.current = id;
    return () => { navigator.geolocation.clearWatch(id); watchId.current = null; };
  }, [activeTrip?.id]);

  useEffect(() => {
    if (!nativePlatform()) return;
    let cancelled = false;
    async function scheduleInspectionReminders() {
      try {
        const mod = await import("@capacitor/local-notifications");
        const { LocalNotifications } = mod;
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== "granted") await LocalNotifications.requestPermissions();
        const response = await fetch("/api/native/upcoming-inspections", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        const inspections = Array.isArray(payload) ? payload : payload.inspections || payload.data || [];
        const prefs = await fetch("/api/settings/time-preferences", { cache: "no-store" }).then((r) => r.ok ? r.json() : ({ timeZone: detectDeviceTimeZone() }));
        const notifications: any[] = [];
        for (const inspection of inspections.slice(0, 30)) {
          const date = inspection.inspection_date || inspection.scheduled_date;
          const time = inspection.inspection_time || inspection.scheduled_time;
          if (!date || !time) continue;
          const start = new Date(inspection.scheduled_start_at || inspectionLocalToUtc(date, time, prefs.timeZone));
          for (const minutes of [120, 30]) {
            const at = new Date(start.getTime() - minutes * 60000);
            if (at.getTime() <= Date.now()) continue;
            const numeric = Math.abs(Array.from(String(`${inspection.id}-${minutes}`)).reduce((n, c) => ((n * 31 + c.charCodeAt(0)) | 0), 7));
            notifications.push({ id: numeric || 1, title: minutes === 120 ? "Inspection in 2 hours" : "Inspection in 30 minutes", body: inspection.property_address || "Upcoming inspection", schedule: { at }, extra: { url: `/inspections/${inspection.id}` } });
          }
        }
        if (notifications.length) await LocalNotifications.schedule({ notifications });
      } catch (error) { console.warn("Native local reminder setup unavailable", error); }
    }
    scheduleInspectionReminders();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const start = async (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      let coords: GeolocationCoordinates | null = null;
      try { coords = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, { enableHighAccuracy: true })); } catch {}
      const response = await fetch("/api/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", inspectionId: detail.inspectionId, purpose: detail.purpose, latitude: coords?.latitude, longitude: coords?.longitude }) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setActiveTrip(data.trip);
    };
    const stop = async () => {
      if (!activeTrip?.id) return;
      let coords: GeolocationCoordinates | null = null;
      try { coords = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, { enableHighAccuracy: true })); } catch {}
      const response = await fetch("/api/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", tripId: activeTrip.id, latitude: coords?.latitude, longitude: coords?.longitude }) });
      if (response.ok) setActiveTrip(null);
    };
    window.addEventListener("onpoint:mileage-start", start);
    window.addEventListener("onpoint:mileage-stop", stop);
    return () => { window.removeEventListener("onpoint:mileage-start", start); window.removeEventListener("onpoint:mileage-stop", stop); };
  }, [activeTrip?.id]);

  return null;
}

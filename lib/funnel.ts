// Lightweight, fire-and-forget signup-funnel tracking. Writes to the existing
// public /api/app-analytics/track endpoint (service-role insert into
// app_device_events), so it works for signed-OUT marketing/signup visitors.
// Never throws, never blocks the UI.

function getDeviceId(): string {
  try {
    const key = "onpoint_device_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return "unknown";
  }
}

export function trackFunnel(
  eventType: string,
  opts?: { path?: string; meta?: Record<string, any> },
) {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/app-analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventType,
        path: opts?.path || window.location.pathname,
        deviceId: getDeviceId(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        referrer: document.referrer || null,
        meta: opts?.meta || undefined,
      }),
    }).catch(() => {});
  } catch {
    /* never break the page over analytics */
  }
}

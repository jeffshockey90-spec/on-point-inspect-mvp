// Crash-survivable breadcrumb logger for the AI live camera.
//
// A WebView crash takes the in-memory console with it, so to see what led up to
// a crash we write timestamped events — plus a JS-heap snapshot when the engine
// exposes one — to a capped ring buffer in localStorage, flushed on EVERY event.
// That way the exact event that triggered the crash is on disk before the crash.
//
// We also track whether a camera session ended cleanly. If the app opens the
// camera but never closes it cleanly (crash / jetsam kill / force-quit), the
// next open preserves that session's breadcrumbs under a separate key so they
// can be read and copied — the inspector taps "Copy crash log" and pastes it.

const LOG_KEY = "flow-livecam-log";
const LAST_CRASH_KEY = "flow-livecam-last-crash";
const SESSION_KEY = "flow-livecam-session-open";
const MAX_EVENTS = 200;

export type CamLogEntry = { t: number; e: string; mem?: number; d?: any };

function heapMb(): number | undefined {
  try {
    const mem = (performance as any)?.memory?.usedJSHeapSize;
    return mem ? Math.round(mem / 1048576) : undefined;
  } catch {
    return undefined;
  }
}

function readArr(key: string): CamLogEntry[] {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Append one breadcrumb. Never throws (storage can be unavailable/full).
export function logCam(event: string, data?: any) {
  const entry: CamLogEntry = { t: Date.now(), e: event, mem: heapMb() };
  if (data !== undefined) entry.d = data;
  try {
    const arr = readArr(LOG_KEY);
    arr.push(entry);
    if (arr.length > MAX_EVENTS) arr.splice(0, arr.length - MAX_EVENTS);
    window.localStorage.setItem(LOG_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
  try {
    // Also to the console for live debugging / device logs.
    console.debug(
      `[livecam] ${event}${entry.mem != null ? ` (${entry.mem}MB)` : ""}`,
      data ?? "",
    );
  } catch {
    /* ignore */
  }
}

// Call ONCE on mount (before opening the camera). If a prior session opened but
// never closed cleanly — the SESSION flag is still set because a crash / jetsam
// kill / force-quit skipped the clean-close path — its breadcrumbs are preserved
// as the "last crash" log, the stale flag is cleared, and this returns true so
// the UI can offer to copy the crash log. A normal close/unmount clears the flag
// (see endCamSessionClean), so this only fires after a genuine abnormal exit.
export function detectPriorCrash(): boolean {
  try {
    const unclean = Boolean(window.localStorage.getItem(SESSION_KEY));
    if (unclean) {
      const prior = window.localStorage.getItem(LOG_KEY);
      if (prior && prior !== "[]") {
        window.localStorage.setItem(LAST_CRASH_KEY, prior);
      }
      window.localStorage.removeItem(SESSION_KEY);
      return window.localStorage.getItem(LAST_CRASH_KEY) ? true : false;
    }
  } catch {
    /* ignore */
  }
  return false;
}

// Call when the camera opens: fresh breadcrumb buffer + mark the session open so
// an abnormal exit (no clean close) is detectable on the next mount.
export function beginCamSession() {
  try {
    window.localStorage.setItem(LOG_KEY, "[]");
    window.localStorage.setItem(SESSION_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

// Call on a clean close/unmount so the session is NOT flagged as a crash.
export function endCamSessionClean() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasCrashLog(): boolean {
  try {
    return Boolean(window.localStorage.getItem(LAST_CRASH_KEY));
  } catch {
    return false;
  }
}

export function clearCrashLog() {
  try {
    window.localStorage.removeItem(LAST_CRASH_KEY);
  } catch {
    /* ignore */
  }
}

function format(arr: CamLogEntry[]): string {
  if (!arr.length) return "No live-camera log recorded.";
  const start = arr[0].t;
  const lines = arr.map((x) => {
    const rel = ((x.t - start) / 1000).toFixed(2).padStart(7, " ");
    const mem = x.mem != null ? `${String(x.mem).padStart(4, " ")}MB` : "   -  ";
    const d = x.d != null ? ` ${JSON.stringify(x.d)}` : "";
    return `+${rel}s ${mem}  ${x.e}${d}`;
  });
  const header = `FLOW live-camera log — ${arr.length} events, ${new Date(
    start,
  ).toLocaleString()}\nUA: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}\n`;
  return `${header}\n${lines.join("\n")}`;
}

// Human-readable dump of the CURRENT session's breadcrumbs.
export function formatCamLog(): string {
  return format(readArr(LOG_KEY));
}

// Human-readable dump of the PRESERVED last-crash breadcrumbs (for copying).
export function formatCrashLog(): string {
  return format(readArr(LAST_CRASH_KEY));
}

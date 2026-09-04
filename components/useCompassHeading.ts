import { useCallback, useEffect, useRef, useState } from "react";

// Live device compass heading for the AI camera. Returns the heading in degrees
// (0 = true north, clockwise) and its 8-point cardinal (N/NE/E/…). iOS 13+ gates
// the sensor behind a permission prompt that MUST be requested from a user
// gesture, so callers invoke `start()` on a tap; Android/desktop generally start
// on mount. Nothing here throws if the sensor is missing — `heading` stays null.
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function headingToCardinal(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return CARDINALS[idx];
}

export function useCompassHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const startedRef = useRef(false);
  // Last committed whole-degree heading — deviceorientation fires ~60Hz and the
  // raw value jitters in fractions of a degree, so without this every sample
  // would setHeading() and re-render the (large) live-camera component. Only
  // commit when the rounded heading actually changes.
  const lastHeadingRef = useRef<number | null>(null);

  const handle = useCallback((event: any) => {
    let deg: number | null = null;
    // iOS exposes a true-north compass heading directly.
    if (typeof event?.webkitCompassHeading === "number" && !Number.isNaN(event.webkitCompassHeading)) {
      deg = event.webkitCompassHeading;
    } else if (typeof event?.alpha === "number" && !Number.isNaN(event.alpha)) {
      // alpha is counter-clockwise from north; convert to a compass heading.
      deg = 360 - event.alpha;
    }
    if (deg == null) return;
    const rounded = Math.round(((deg % 360) + 360) % 360) % 360;
    if (lastHeadingRef.current === rounded) return; // ignore sub-degree jitter
    lastHeadingRef.current = rounded;
    setHeading(rounded);
  }, []);

  const attach = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    window.addEventListener("deviceorientationabsolute", handle, true);
    window.addEventListener("deviceorientation", handle, true);
  }, [handle]);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    const DOE: any = (window as any).DeviceOrientationEvent;
    if (!DOE) return;
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setNeedsPermission(true);
          return;
        }
        setNeedsPermission(false);
      } catch {
        setNeedsPermission(true);
        return;
      }
    }
    attach();
  }, [attach]);

  useEffect(() => {
    // Best-effort auto-start (works where no permission prompt is required).
    const DOE: any = typeof window !== "undefined" ? (window as any).DeviceOrientationEvent : null;
    if (DOE && typeof DOE.requestPermission !== "function") {
      attach();
    } else if (DOE) {
      setNeedsPermission(true); // iOS: wait for a tap to request permission
    }
    return () => {
      window.removeEventListener("deviceorientationabsolute", handle, true);
      window.removeEventListener("deviceorientation", handle, true);
    };
  }, [attach, handle]);

  return {
    heading,
    cardinal: heading == null ? null : headingToCardinal(heading),
    needsPermission,
    start,
  };
}

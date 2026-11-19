"use client";

// Diagnostic only: add ?screen=1 to any page URL to see the width/height the
// page is actually given (e.g. to tell whether the iOS app runs full-size on
// a foldable's inner screen or boxed at phone size). Renders nothing otherwise.

import { useEffect, useState } from "react";

export default function ScreenSizeCheck() {
  const [size, setSize] = useState<string | null>(null);
  useEffect(() => {
    let enabled = false;
    try {
      enabled = new URLSearchParams(window.location.search).get("screen") === "1";
    } catch {
      enabled = false;
    }
    if (!enabled) return;
    const update = () =>
      setSize(
        `${window.innerWidth} × ${window.innerHeight} · screen ${window.screen.width} × ${window.screen.height} · ${window.devicePixelRatio}x · two-pane builder ${window.innerWidth >= 600 ? "ON" : "off (needs 600+)"}`,
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  if (!size) return null;
  return (
    <div className="fixed inset-x-2 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[100] rounded-xl border border-teal-400 bg-[var(--fl-surface)] px-3 py-2 text-center text-xs font-bold text-[var(--fl-text)] shadow-lg">
      {size}
    </div>
  );
}

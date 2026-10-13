"use client";

import { useEffect } from "react";
import { trackFunnel } from "../lib/funnel";

// Drop-in client tracker for the (server-rendered) marketing homepage. Fires a
// "home_view" when a signed-out visitor lands, and a "home_cta_click" whenever
// they click any link to /signup — captured by delegation so we don't have to
// wire every CTA. Fire-and-forget; never affects navigation.
export default function HomeFunnelTracker() {
  useEffect(() => {
    trackFunnel("home_view");

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const link = target?.closest?.('a[href="/signup"]') as HTMLAnchorElement | null;
      if (!link) return;
      trackFunnel("home_cta_click", {
        meta: { cta: (link.textContent || "").trim().slice(0, 60) },
      });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}

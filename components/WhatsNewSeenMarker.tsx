"use client";

import { useEffect } from "react";

// Mounted on the What's New page: marks it seen (clears the nav dot) on open.
export default function WhatsNewSeenMarker() {
  useEffect(() => {
    void fetch("/api/whats-new", { method: "POST", keepalive: true }).catch(() => {});
    // Clear the nav badge immediately without waiting for its next poll.
    try {
      window.dispatchEvent(new Event("whats-new-seen"));
    } catch {}
  }, []);

  return null;
}

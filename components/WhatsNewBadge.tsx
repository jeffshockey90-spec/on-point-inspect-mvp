"use client";

import { useEffect, useState } from "react";

// A small unread DOT on the "What's New" nav item — shows when a changelog was
// published after this user last opened What's New. Non-blocking: it never gates
// the nav render, it just polls in the background (mirrors SupportUnreadBadge).
export default function WhatsNewBadge({
  className = "",
  pollMs = 60000,
}: {
  className?: string;
  pollMs?: number;
}) {
  const [unread, setUnread] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/whats-new", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setUnread(res.ok && data?.unread === true);
    } catch {
      setUnread(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, pollMs);
    // Clear the moment the user opens What's New (the page fires this).
    function onSeen() {
      setUnread(false);
    }
    window.addEventListener("whats-new-seen", onSeen);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("whats-new-seen", onSeen);
    };
  }, [pollMs]);

  if (!unread) return null;

  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full bg-red-500 shadow-lg shadow-red-500/30 ${className}`}
      aria-label="New updates in What's New"
    />
  );
}

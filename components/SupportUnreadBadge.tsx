"use client";

import { useEffect, useState } from "react";

type Props = {
  className?: string;
  pollMs?: number;
};

export default function SupportUnreadBadge({ className = "", pollMs = 30000 }: Props) {
  const [count, setCount] = useState(0);

  async function loadCount() {
    try {
      const res = await fetch("/api/support/unread-count", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setCount(0);
        return;
      }

      setCount(Number(data?.count || 0));
    } catch {
      setCount(0);
    }
  }

  useEffect(() => {
    loadCount();
    const timer = window.setInterval(loadCount, pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs]);

  if (count <= 0) return null;

  return (
    <span
      className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-black leading-none text-white shadow-lg shadow-red-500/30 ${className}`}
      aria-label={`${count} unread support messages`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

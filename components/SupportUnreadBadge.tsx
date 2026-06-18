"use client";

import { useEffect, useState } from "react";

export default function SupportUnreadBadge({
  className = "",
}: {
  className?: string;
}) {
  const [count, setCount] = useState(0);

  async function loadCount() {
    try {
      const res = await fetch("/api/support/unread-count", {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = await res.json();
      setCount(Number(data?.count || 0));
    } catch {
      setCount(0);
    }
  }

  useEffect(() => {
    loadCount();

    const timer = window.setInterval(loadCount, 30000);

    return () => window.clearInterval(timer);
  }, []);

  if (!count) return null;

  return (
    <span
      className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
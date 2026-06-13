"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FastLinkButton({
  href,
  children,
  loadingText = "Opening...",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  function handlePointerEnter() {
    router.prefetch(href);
  }

  function handleTouchStart() {
    router.prefetch(href);
  }

  function handleClick() {
    if (opening) return;
    setOpening(true);
  }

  return (
    <Link
      href={href}
      prefetch
      onPointerEnter={handlePointerEnter}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      aria-busy={opening}
      className={`${className} inline-flex items-center justify-center gap-2 transition active:scale-[0.98] [touch-action:manipulation] ${
        opening ? "pointer-events-none opacity-80" : ""
      }`}
    >
      {opening && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {opening ? loadingText : children}
    </Link>
  );
}

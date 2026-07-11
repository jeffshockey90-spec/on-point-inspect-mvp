"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type FastLinkButtonProps = {
  href: string;
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  activeClassName?: string;
  title?: string;
  target?: string;
  rel?: string;
  prefetch?: boolean;
  onClick?: () => void;
};

export default function FastLinkButton({
  href,
  children,
  loadingText = "Opening...",
  className = "",
  activeClassName = "",
  title,
  target,
  rel,
  prefetch = true,
  onClick,
}: FastLinkButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [opening, setOpening] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isExternal = /^(https?:|mailto:|tel:)/i.test(href);
  const isHashOnly = href.startsWith("#");

  useEffect(() => {
    setOpening(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  function prefetchHref() {
    if (!prefetch || isExternal || isHashOnly) return;
    try {
      router.prefetch(href);
    } catch {}
  }

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.();

    if (
      isExternal ||
      isHashOnly ||
      target === "_blank" ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (opening) {
      event.preventDefault();
      return;
    }

    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (href === pathname || href === current) return;

    setOpening(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setOpening(false), 1800);
  }

  return (
    <Link
      href={href}
      prefetch={prefetch && !isExternal && !isHashOnly}
      title={title}
      target={target}
      rel={rel || (target === "_blank" ? "noreferrer" : undefined)}
      onPointerDown={prefetchHref}
      onPointerEnter={prefetchHref}
      onFocus={prefetchHref}
      onClick={handleClick}
      aria-busy={opening}
      data-fast-click="true"
      className={`${className} inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl active:scale-[0.98] active:opacity-85 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
        opening ? `pointer-events-none opacity-80 ${activeClassName}` : ""
      }`}
    >
      {opening && (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      <span>{opening ? loadingText : children}</span>
    </Link>
  );
}

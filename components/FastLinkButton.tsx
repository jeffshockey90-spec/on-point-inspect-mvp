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
  const searchParamsText = searchParams.toString();

  const [opening, setOpening] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isExternal =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:");

  function clearOpening() {
    setOpening(false);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function prefetchHref() {
    if (!prefetch || isExternal) return;

    try {
      router.prefetch(href);
    } catch {}
  }

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.();

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === "_blank" ||
      isExternal
    ) {
      clearOpening();
      return;
    }

    if (opening) {
      event.preventDefault();
      return;
    }

    setOpening(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setOpening(false);
      timeoutRef.current = null;
    }, 1800);
  }

  useEffect(() => {
    clearOpening();
    // Reset on path OR query-string changes. This prevents spinner states from
    // sticking when moving between /share/123 and /share/123?role=realtor.
  }, [pathname, searchParamsText, href]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <Link
      href={href}
      prefetch={prefetch && !isExternal}
      title={title}
      target={target}
      rel={rel || (target === "_blank" ? "noreferrer" : undefined)}
      onPointerEnter={prefetchHref}
      onFocus={prefetchHref}
      onClick={handleClick}
      aria-busy={opening}
      data-fast-click="true"
      className={`${className} inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl transition duration-150 active:scale-[0.98] active:opacity-90 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
        opening ? `pointer-events-none opacity-80 ${activeClassName}` : ""
      }`}
    >
      {opening ? (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      <span>{opening ? loadingText : children}</span>
    </Link>
  );
}

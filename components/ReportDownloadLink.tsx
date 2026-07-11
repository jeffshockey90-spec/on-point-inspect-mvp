"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
  preparingText?: string;
};

export default function ReportDownloadLink({
  href,
  children,
  className = "",
  preparingText = "Preparing Download...",
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    setPreparing(false);

    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }

  function handleClick() {
    if (preparing) return;

    setPreparing(true);

    // Keep the browser's normal direct-download behavior. This avoids
    // buffering a large PDF in the page and still gives instant feedback.
    resetTimer.current = setTimeout(() => {
      reset();
    }, 60000);
  }

  useEffect(() => {
    function handlePageShow() {
      reset();
    }

    function handleFocus() {
      // A completed browser download commonly returns focus to the page.
      window.setTimeout(reset, 1200);
    }

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);

      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-busy={preparing}
      data-fast-click="true"
      className={`${className} ${
        preparing ? "pointer-events-none opacity-80" : ""
      }`}
    >
      {preparing ? (
        <>
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{preparingText}</span>
        </>
      ) : (
        children
      )}
    </a>
  );
}

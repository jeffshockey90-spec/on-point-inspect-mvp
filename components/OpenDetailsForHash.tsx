"use client";

// Builder helper: when a "#anchor" link is tapped (or the page opens with a
// hash) and the target sits inside a closed section (More, AI & Insights),
// open it first so the jump lands on something visible.

import { useEffect } from "react";
import { openClosedAncestors } from "../lib/revealElement";

export default function OpenDetailsForHash() {
  useEffect(() => {
    const reveal = (hash: string) => {
      const id = decodeURIComponent(hash.replace(/^#/, ""));
      if (!id) return;
      const el = document.getElementById(id);
      if (el) openClosedAncestors(el);
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (anchor) reveal(anchor.getAttribute("href") || "");
    };
    const onHash = () => reveal(window.location.hash);
    // Capture phase: runs before the browser's own jump and other handlers.
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  return null;
}

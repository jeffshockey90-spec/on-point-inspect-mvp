"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tabForAnchor, workspaceTabHref, type WorkspaceTab } from "../lib/report/workspaceTabs";

// Keeps in-page "#anchor" links working now that the report builder renders one
// tab at a time. If a link (status chip, next-step button, shared URL) points at
// a panel that lives in another tab, switch to that tab and keep the anchor so
// the page lands on it.
export default function ReportTabHashRouter({ active }: { active: WorkspaceTab }) {
  const router = useRouter();

  useEffect(() => {
    function routeTo(hash: string): boolean {
      const id = hash.replace(/^#/, "");
      if (!id || document.getElementById(id)) return false;
      const tab = tabForAnchor(id);
      if (!tab || tab === active) return false;
      router.push(workspaceTabHref(tab, id), { scroll: false });
      return true;
    }

    // A URL that arrives with a hash for another tab (e.g. a shared link).
    if (window.location.hash) routeTo(window.location.hash);

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!link) return;
      if (routeTo(link.getAttribute("href") || "")) event.preventDefault();
    }

    // After a tab switch the target renders a moment later; scroll to it then.
    let tries = 0;
    const id = window.location.hash.replace(/^#/, "");
    const timer = id
      ? window.setInterval(() => {
          const el = document.getElementById(id);
          if (el || ++tries > 20) {
            window.clearInterval(timer);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100)
      : 0;

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (timer) window.clearInterval(timer);
    };
  }, [active, router]);

  return null;
}

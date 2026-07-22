"use client";

import { usePathname } from "next/navigation";
import { isPortalRoute } from "../lib/navVisibility";

export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const showsNavShell = !isPortalRoute(pathname);

  return (
    <div
      className={`min-h-screen pt-[env(safe-area-inset-top)] pb-28 xl:pt-0 md:pb-0 ${
        showsNavShell ? "xl:pl-64" : ""
      }`}
    >
      {children}
    </div>
  );
}

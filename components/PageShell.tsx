"use client";

import { usePathname } from "next/navigation";
import { isPortalRoute } from "../lib/navVisibility";

export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const showsNavShell = !isPortalRoute(pathname);

  return (
    <div
      className={`min-h-screen pt-[env(safe-area-inset-top)] xl:pt-0 ${
        showsNavShell ? "pb-28 md:pb-0 xl:pl-64" : ""
      }`}
    >
      {children}
    </div>
  );
}

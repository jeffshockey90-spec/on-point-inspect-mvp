"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { hidesNavShell } from "../lib/navVisibility";
import GlobalSearchButton from "./GlobalSearchButton";
import {
  markTimePreferencesReady,
  TIME_PREFERENCES_EVENT,
} from "../lib/app-time";

export default function PageShell({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  const pathname = usePathname() || "";
  const showsNavShell = !hidesNavShell(pathname, signedIn);

  // After hydration, switch time formatting from the server-matching default
  // zone to the device's stored zone and re-render the page so displayed times
  // update. Also re-render when the user changes their time preference.
  const [, setTimePrefsTick] = useState(0);
  useEffect(() => {
    markTimePreferencesReady();
    setTimePrefsTick((tick) => tick + 1);

    const onChange = () => setTimePrefsTick((tick) => tick + 1);
    window.addEventListener(TIME_PREFERENCES_EVENT, onChange);
    return () => window.removeEventListener(TIME_PREFERENCES_EVENT, onChange);
  }, []);

  return (
    <div
      className={`min-h-screen pt-[env(safe-area-inset-top)] xl:pt-0 ${
        showsNavShell ? "pb-28 md:pb-0 xl:pl-64" : ""
      }`}
    >
      {children}
      {showsNavShell && <GlobalSearchButton />}
    </div>
  );
}

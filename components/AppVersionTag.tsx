"use client";

import { useEffect, useState } from "react";
import { formatBuildDate, webBuildLabel } from "../lib/buildInfo";

// Shows the auto-updating web/deploy build stamp, plus the installed native app
// version + build number (CFBundleShortVersionString / CFBundleVersion, or the
// Android equivalents) when running inside the iOS/Android app.
export default function AppVersionTag() {
  const [native, setNative] = useState<{ version: string; build: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const isNative =
          typeof window !== "undefined" &&
          Boolean((window as any).Capacitor?.isNativePlatform?.());
        if (!isNative) return;

        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        setNative({ version: info.version, build: info.build });
      } catch {
        // Web / plugin unavailable - just show the web build below.
      }
    })();
  }, []);

  const date = formatBuildDate();

  return (
    <div className="mt-8 flex flex-col items-center gap-1 pb-4 text-center text-xs text-slate-500">
      <p className="font-mono tracking-wide">{webBuildLabel()}</p>
      {native ? (
        <p className="font-mono tracking-wide">
          App {native.version} ({native.build})
        </p>
      ) : null}
      {date ? <p>Updated {date}</p> : null}
    </div>
  );
}

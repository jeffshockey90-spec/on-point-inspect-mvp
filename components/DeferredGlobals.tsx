"use client";

import dynamic from "next/dynamic";

// These two always-on components render nothing until the user acts (Cmd-K opens
// the palette) or a live event arrives, yet the eager versions hydrated on every
// page and competed for main-thread time, delaying first interactivity. Loading
// them client-only (ssr:false, allowed here because this is a client component)
// keeps them out of the initial hydration path so pages become clickable sooner.
const GlobalLiveActivity = dynamic(() => import("./GlobalLiveActivity"), {
  ssr: false,
});
const CommandPalette = dynamic(() => import("./CommandPalette"), {
  ssr: false,
});
// Push taps and universal links need a listener attached wherever the user is,
// including on a cold start. This renders nothing; it just has to be mounted.
const NativeDeepLinks = dynamic(() => import("./NativeDeepLinks"), {
  ssr: false,
});

export default function DeferredGlobals() {
  return (
    <>
      <GlobalLiveActivity />
      <CommandPalette />
      <NativeDeepLinks />
    </>
  );
}

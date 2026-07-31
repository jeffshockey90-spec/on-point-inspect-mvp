// Build stamp, inlined at build time from next.config.js (env). Auto-changes on
// every deploy - the SHA always changes per push; the build number is the git
// commit count when full history is available.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
export const BUILD_NUMBER = process.env.NEXT_PUBLIC_BUILD_NUMBER || "";
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";

export function formatBuildDate() {
  if (!BUILD_TIME) return "";
  const date = new Date(BUILD_TIME);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A short one-line label for the web/deploy build, e.g. "v1.7.0 · build 978 · 372bd30".
export function webBuildLabel() {
  const parts = [`v${APP_VERSION}`];
  if (BUILD_NUMBER) parts.push(`build ${BUILD_NUMBER}`);
  if (BUILD_SHA && BUILD_SHA !== "dev") parts.push(BUILD_SHA);
  return parts.join(" · ");
}

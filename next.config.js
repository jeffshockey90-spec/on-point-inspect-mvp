const { withSentryConfig } = require("@sentry/nextjs");
const { execSync } = require("child_process");
const pkg = require("./package.json");

// Build stamp captured at build time so it changes automatically on every
// deploy - no manual bumping. The commit SHA is the reliable identifier
// (Vercel exposes VERCEL_GIT_COMMIT_SHA even on shallow clones); the commit
// count is a friendlier incrementing "build number" when full git history is
// available.
function safeGit(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const buildSha = (
  process.env.VERCEL_GIT_COMMIT_SHA || safeGit("git rev-parse HEAD")
).slice(0, 7);
const buildTime = new Date().toISOString();
// A UTC timestamp-based build number (YYYYMMDD.HHMM). Reliable everywhere and
// always increments per deploy - unlike `git rev-list --count`, which returns
// a wrong small value on Vercel's shallow clone.
const buildDate = new Date(buildTime);
const pad = (n) => String(n).padStart(2, "0");
const buildNumber = `${buildDate.getUTCFullYear()}${pad(
  buildDate.getUTCMonth() + 1,
)}${pad(buildDate.getUTCDate())}.${pad(buildDate.getUTCHours())}${pad(
  buildDate.getUTCMinutes(),
)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version || "0.0.0",
    NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },

  // Clean URLs for the public acquisition landing pages. The pages themselves
  // are standalone static files in /public (no app chrome, no global-CSS
  // collision); these rewrites serve them at extension-less marketing URLs.
  // Both paths are allow-listed in proxy.ts PUBLIC_PREFIXES so they skip the
  // login wall.
  async rewrites() {
    return [
      { source: "/switch-from-horizon", destination: "/switch-from-horizon.html" },
      { source: "/vs-spectora", destination: "/vs-spectora.html" },
    ];
  },

  // Video conversion (/api/video-convert) shells out to the ffmpeg-static binary.
  // Two things are needed for that to work on Vercel:
  // 1) Keep ffmpeg-static EXTERNAL so Next doesn't inline it — otherwise its
  //    __dirname resolves next to the route file (…/app/api/video-convert/ffmpeg)
  //    instead of node_modules, and spawn() fails with ENOENT.
  // 2) Trace the actual binary (a data file Next won't include on its own) into
  //    the function so it exists at that node_modules path.
  // @sparticuz/chromium needs the same treatment as ffmpeg-static and for the
  // same reason: it resolves bin/chromium.br relative to its own __dirname, so
  // inlining it makes that path point next to the route file and the binary
  // "disappears" at runtime. External + traced (below) is what makes the bundled
  // Chromium actually resolvable — without both, the PDF routes silently fall
  // back to downloading a 50MB pack from GitHub on every cold start.
  serverExternalPackages: ["ffmpeg-static", "@sparticuz/chromium", "sharp"],

  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Lower peak memory during the webpack production build. The app has grown
    // enough that Vercel's 8GB build container was hitting OOM (SIGKILL) in the
    // "optimized production build" phase; this trades a slightly longer build
    // for a materially smaller memory footprint.
    webpackMemoryOptimizations: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
  },

  // NOTE: this must stay a SINGLE key. There were previously two
  // `outputFileTracingIncludes` literals in this object and the later one
  // silently won, dropping the earlier includes — that class of bug is invisible
  // until a binary goes missing at runtime in production.
  outputFileTracingIncludes: {
    "/api/repair-video": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/convert-video": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/video-convert": ["./node_modules/ffmpeg-static/ffmpeg"],
    // Nightly job that extracts a poster frame from videos missing one.
    "/api/cron/backfill-video-posters": ["./node_modules/ffmpeg-static/ffmpeg"],

    // Ship Chromium inside the PDF functions. Without this, @sparticuz/chromium
    // has no binary in the traced bundle and the routes fall back to pulling a
    // ~50MB pack from GitHub on every cold start — 15-30s of a 60s budget, and a
    // hard failure whenever GitHub is slow.
    //
    // Only bin/** — that's the ~64MB of compressed payload Next won't trace on
    // its own. The package's JS comes along via serverExternalPackages, and
    // globbing the whole package would duplicate it in every function bundle,
    // which matters against Vercel's 250MB unzipped function limit.
    "/api/realtor-report-download/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/repair-request-addendum/[token]": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken set - source map upload is opt-in later once
  // SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN exist. Error capture and
  // alerting work fully without it; you'd just see minified stack traces.
});
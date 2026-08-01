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

  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
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

  outputFileTracingIncludes: {
    "/api/repair-video": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/convert-video": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/video-convert": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken set - source map upload is opt-in later once
  // SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN exist. Error capture and
  // alerting work fully without it; you'd just see minified stack traces.
});
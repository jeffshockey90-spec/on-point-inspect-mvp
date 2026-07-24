const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
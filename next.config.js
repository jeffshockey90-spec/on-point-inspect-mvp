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

module.exports = nextConfig;
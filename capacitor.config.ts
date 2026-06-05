import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.onpointinspect.app",
  appName: "On Point Inspect",
  webDir: "public",
  server: {
    url: "https://on-point-inspect-mvp.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
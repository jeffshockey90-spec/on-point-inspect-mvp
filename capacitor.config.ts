import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.onpointhomeinspect.inspect",
  appName: "FLOW",
  webDir: "public",
  server: {
    url: "https://on-point-inspect-mvp.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    useLegacyBridge: true,
  },
};

export default config;

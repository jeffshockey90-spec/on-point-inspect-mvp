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
    contentInset: "never",
  },
  android: {
    useLegacyBridge: true,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#020617",
      launchAutoHide: true,
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
};

export default config;

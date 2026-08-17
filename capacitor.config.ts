import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.onpointhomeinspect.inspect",
  appName: "FLOW",
  webDir: "public",
  server: {
    url: "https://app.flowinspect.app",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
    // Lets the server detect the iOS shell (see lib/iosShell.ts) so subscription
    // pricing and purchase CTAs are never rendered inside the App Store build.
    // Keep in sync with IOS_SHELL_UA_TAG.
    appendUserAgent: "FlowInspectIOS",
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

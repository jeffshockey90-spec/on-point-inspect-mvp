import * as Sentry from "@sentry/nextjs";
import { shouldDropSentryEvent } from "./lib/sentryFilter";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Benign browser noise, not actionable bugs — don't report (these were
  // creating false alerts). See lib/sentryFilter.ts for the full reasoning:
  //   - Aborted fetches (navigate away mid-request / WKWebView cancels a slow
  //     request): reject as AbortError / DOMException code 20.
  //   - Facebook/Instagram in-app-browser injected logger throwing "Error
  //     invoking postMessage: Java object is gone" on unload — their script,
  //     not ours, fired when a client opened a /share link inside those apps.
  ignoreErrors: [
    "AbortError",
    "The user aborted a request",
    "The operation was aborted",
    "The operation was aborted.",
    "signal is aborted without reason",
    "Request aborted",
    "Load failed", // Safari's message for a fetch cancelled on navigation
    "Java object is gone", // Facebook/Instagram in-app-browser injected logger
    "Error invoking postMessage",
  ],
  beforeSend(event, hint) {
    // Single source of truth for drop decisions, unit-tested in
    // lib/sentryFilter.test.ts (beforeSend itself can't run Sentry.init).
    return shouldDropSentryEvent(event, hint) ? null : event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

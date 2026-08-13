import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Aborted fetches reject with AbortError (DOMException code 20). This happens
  // when the user navigates away mid-request, iOS WKWebView cancels a slow
  // request, or an action is cancelled — all benign, not actionable bugs. Don't
  // report them (they were creating noise / false alerts on the field tool).
  ignoreErrors: [
    "AbortError",
    "The user aborted a request",
    "The operation was aborted",
    "The operation was aborted.",
    "signal is aborted without reason",
    "Request aborted",
    "Load failed", // Safari's message for a fetch cancelled on navigation
  ],
  beforeSend(event, hint) {
    const err: any = hint?.originalException;
    const name = err?.name || "";
    const code = err?.code;
    // DOMException.ABORT_ERR === 20
    if (name === "AbortError" || code === 20) return null;
    const message = String(err?.message || event?.message || "");
    if (/\bAbortError\b|\baborted\b/i.test(message)) return null;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

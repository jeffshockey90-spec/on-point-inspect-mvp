// Decides which browser-side errors Sentry should drop instead of reporting.
// Pure and dependency-free so it can be unit-tested without running Sentry.init.
//
// Two classes of noise, neither an actionable FLOW bug:
//   1. Aborted requests — the user navigated away mid-fetch, or a WebView
//      cancelled a slow request. These reject as AbortError / DOMException
//      code 20 and were creating false alerts on the field tool.
//   2. In-app-browser injected loggers. Facebook / Instagram open links in
//      their own Android WebView, which injects a
//      `navigation_performance_logger_android` script that postMessages to a
//      native Java bridge on page unload. Once that bridge object is
//      garbage-collected the script throws "Error invoking postMessage: Java
//      object is gone". It fires from THEIR injected script, not our code, and
//      only inside those apps — e.g. a realtor opening a /share report link
//      from our email inside the Facebook app. Nothing a client sees, nothing
//      we can fix; just stop it from paging us.

export type MinimalErrorHint = { originalException?: unknown };

type SentryFrame = {
  filename?: string;
  abs_path?: string;
  module?: string;
};

export type SentryLikeEvent = {
  message?: string;
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: { frames?: SentryFrame[] };
    }>;
  };
};

const ABORT_MESSAGE = /\bAbortError\b|\baborted\b/i;

// Message of a third-party in-app-browser injected-logger error.
const IN_APP_BROWSER_MESSAGE = /Java object is gone|Error invoking postMessage/i;
// Origin of Facebook's / Instagram's injected navigation logger.
const IN_APP_BROWSER_FRAME = /navigation_performance_logger/i;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

// True when the error is an aborted request / navigation cancellation.
export function isAbortError(err: any): boolean {
  if (!err) return false;
  if (err.name === "AbortError") return true;
  if (err.code === 20) return true; // DOMException.ABORT_ERR
  return ABORT_MESSAGE.test(str(err.message));
}

// Flatten an event's exception messages + frame paths into one searchable
// string, so we can match the origin even when the top-level message is generic.
function collectEventText(event?: SentryLikeEvent): string {
  const parts: string[] = [];
  for (const value of event?.exception?.values || []) {
    parts.push(str(value.value));
    for (const frame of value.stacktrace?.frames || []) {
      parts.push(str(frame.filename), str(frame.abs_path), str(frame.module));
    }
  }
  return parts.join(" ");
}

// True when the error originates from an in-app-browser injected logger.
export function isInAppBrowserNoise(err: any, eventText = ""): boolean {
  const haystack = `${str(err?.message)} ${str(err?.stack)} ${eventText}`;
  if (IN_APP_BROWSER_MESSAGE.test(haystack)) return true;
  return IN_APP_BROWSER_FRAME.test(haystack);
}

// Single decision used by Sentry's beforeSend: true = drop the event.
export function shouldDropSentryEvent(
  event?: SentryLikeEvent,
  hint?: MinimalErrorHint,
): boolean {
  const err: any = hint?.originalException;
  const eventMessage = str(event?.message);
  const eventText = collectEventText(event);

  if (isAbortError(err) || ABORT_MESSAGE.test(eventMessage)) return true;
  if (isInAppBrowserNoise(err, `${eventMessage} ${eventText}`)) return true;

  return false;
}

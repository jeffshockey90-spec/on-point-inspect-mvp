import { describe, expect, it } from "vitest";
import {
  isAbortError,
  isInAppBrowserNoise,
  shouldDropSentryEvent,
} from "./sentryFilter";

describe("isAbortError", () => {
  it("catches AbortError by name", () => {
    expect(isAbortError({ name: "AbortError", message: "The user aborted a request" })).toBe(true);
  });
  it("catches DOMException abort code 20", () => {
    expect(isAbortError({ name: "DOMException", code: 20, message: "signal is aborted" })).toBe(true);
  });
  it("catches an aborted message without a matching name", () => {
    expect(isAbortError({ message: "The operation was aborted." })).toBe(true);
  });
  it("leaves a real error alone", () => {
    expect(isAbortError({ name: "TypeError", message: "x is not a function" })).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("isInAppBrowserNoise — Facebook/Instagram injected logger", () => {
  it("matches the exact 'Java object is gone' postMessage error", () => {
    expect(
      isInAppBrowserNoise({ message: "Error invoking postMessage: Java object is gone" }),
    ).toBe(true);
  });
  it("matches by the injected logger frame even if the message is generic", () => {
    const err = {
      message: "undefined",
      stack: "at sendDataToNative (app://navigation_performance_logger_android:1:11722)",
    };
    expect(isInAppBrowserNoise(err)).toBe(true);
  });
  it("matches when the origin only shows up in the event frames", () => {
    expect(
      isInAppBrowserNoise({ message: "boom" }, "app://navigation_performance_logger_android:1:20806"),
    ).toBe(true);
  });
  it("does not match an ordinary FLOW error", () => {
    expect(
      isInAppBrowserNoise({ message: "Cannot read properties of undefined", stack: "at l (/_next/static/chunks/page.js)" }),
    ).toBe(false);
  });
});

describe("shouldDropSentryEvent", () => {
  it("drops the real Facebook in-app-browser event from the /share report", () => {
    const event = {
      message: "Error invoking postMessage: Java object is gone",
      exception: {
        values: [
          {
            value: "Error invoking postMessage: Java object is gone",
            stacktrace: {
              frames: [
                { filename: "app://navigation_performance_logger_android" },
                { filename: "app:///_next/static/chunks/7149-6be8b3d5f0a548b3.js" },
              ],
            },
          },
        ],
      },
    };
    const hint = { originalException: new Error("Error invoking postMessage: Java object is gone") };
    expect(shouldDropSentryEvent(event, hint)).toBe(true);
  });

  it("still drops aborted-request noise", () => {
    const hint = { originalException: { name: "AbortError", message: "The user aborted a request" } };
    expect(shouldDropSentryEvent({ message: "" }, hint)).toBe(true);
  });

  it("drops an abort known only from the event message", () => {
    expect(shouldDropSentryEvent({ message: "Request aborted" })).toBe(true);
  });

  it("keeps a genuine application error", () => {
    const event = {
      message: "TypeError: cannot read 'id' of null",
      exception: {
        values: [
          {
            value: "cannot read 'id' of null",
            stacktrace: { frames: [{ filename: "app:///_next/static/chunks/builder.js" }] },
          },
        ],
      },
    };
    const hint = { originalException: new TypeError("cannot read 'id' of null") };
    expect(shouldDropSentryEvent(event, hint)).toBe(false);
  });

  it("keeps a real error from a /share page that is not in-app-browser noise", () => {
    expect(shouldDropSentryEvent({ message: "ChunkLoadError: Loading chunk 7149 failed" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isLikelyNetworkError } from "./networkError";

describe("isLikelyNetworkError", () => {
  it("recognizes classic browser fetch failures", () => {
    expect(isLikelyNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isLikelyNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
    expect(isLikelyNetworkError(new Error("Load failed"))).toBe(true);
  });

  it("recognizes timeouts and storage/upload failures", () => {
    expect(isLikelyNetworkError(new Error("The request timed out"))).toBe(true);
    expect(isLikelyNetworkError(new Error("Storage upload failed"))).toBe(true);
  });

  it("recognizes gateway/connection-reset style failures (the original gap)", () => {
    // This is exactly the class of error that could previously slip past
    // the safety net and require a manual retry instead of auto-queueing.
    expect(isLikelyNetworkError(new Error("Bad Gateway"))).toBe(true);
    expect(isLikelyNetworkError(new Error("ECONNRESET"))).toBe(true);
    expect(isLikelyNetworkError(new Error("socket hang up"))).toBe(true);
    expect(isLikelyNetworkError(new Error("The operation was aborted"))).toBe(true);
    expect(isLikelyNetworkError(new Error("Request failed with status code 503"))).toBe(true);
  });

  it("recognizes a numeric HTTP status field on the error object, even with a generic message", () => {
    expect(isLikelyNetworkError({ status: 502, message: "Internal Server Error" })).toBe(true);
    expect(isLikelyNetworkError({ statusCode: 503, message: "oops" })).toBe(true);
    expect(isLikelyNetworkError({ code: 504, message: "oops" })).toBe(true);
  });

  it("does not treat 4xx client errors as network errors", () => {
    // A validation error, auth failure, or bad request should NOT be
    // silently queued for retry - it will just fail the same way again.
    expect(isLikelyNetworkError({ status: 400, message: "Missing required field" })).toBe(false);
    expect(isLikelyNetworkError({ status: 401, message: "Unauthorized" })).toBe(false);
    expect(isLikelyNetworkError({ status: 404, message: "Not found" })).toBe(false);
  });

  it("does not treat genuine validation/business errors as network errors", () => {
    expect(isLikelyNetworkError(new Error("Enter the limitation wording before saving."))).toBe(false);
    expect(isLikelyNetworkError(new Error("Missing inspection ID."))).toBe(false);
  });

  it("handles null/undefined/empty errors without throwing", () => {
    expect(isLikelyNetworkError(null)).toBe(false);
    expect(isLikelyNetworkError(undefined)).toBe(false);
    expect(isLikelyNetworkError({})).toBe(false);
  });
});

/**
 * Best-effort classifier for "this failure was probably connectivity, not a
 * real validation/server problem". Used by the field tool's offline safety
 * net: if a save fails while we think we're online, this decides whether to
 * automatically queue the work for later sync instead of just showing an
 * error and making the inspector retry by hand.
 */
export function isLikelyNetworkError(error: any): boolean {
  // Weak/flaky field connections don't always fail with a clean "network"
  // or "fetch" wording - a request can time out at a gateway/proxy layer
  // and surface as a generic 5xx or connection-reset error instead. Treat
  // those as network errors too so the offline safety net still catches
  // them, rather than requiring the inspector to notice and manually retry.
  const status = Number(error?.status ?? error?.statusCode ?? error?.code ?? NaN);
  if (Number.isFinite(status) && status >= 500 && status < 600) return true;

  const text = String(
    error?.message || error?.name || error || "",
  ).toLowerCase();

  return (
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("failed to fetch") ||
    text.includes("load failed") ||
    text.includes("offline") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("storage") ||
    text.includes("upload") ||
    text.includes("gateway") ||
    text.includes("econnreset") ||
    text.includes("econnaborted") ||
    text.includes("socket") ||
    text.includes("abort") ||
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504")
  );
}

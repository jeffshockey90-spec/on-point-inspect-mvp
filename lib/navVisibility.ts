const PORTAL_ROUTE_PREFIXES = [
  "/client",
  "/client-portal",
  "/client-agreement",
  "/share",
  "/environmental-share",
  "/repair-request",
  "/repair-response",
  "/my-home",
  "/embed",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/** True for public/portal routes that render without the app's Nav shell. */
export function isPortalRoute(pathname: string): boolean {
  return PORTAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Routes that serve marketing content to a signed-out visitor but are still
// part of the app for someone signed in. "/" is the clearest case: app/page.tsx
// renders the dashboard when there's a session and MarketingHomepage when there
// isn't. Because the same path means two different pages, path matching alone
// can't decide whether to show the nav shell -- isMarketingRoute has to be
// combined with the session, which is what PageShell and Nav do.
//
// "/" is matched exactly and deliberately kept out of the prefix list: every
// path starts with "/", so a prefix entry would hide the nav everywhere.
const MARKETING_ROUTE_PREFIXES = ["/pricing", "/terms", "/privacy"];

export function isMarketingRoute(pathname: string): boolean {
  const path = pathname.split("?")[0];
  if (path === "/") return true;
  return MARKETING_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * True when the app's nav shell should be hidden for this request.
 *
 * Portal routes are always bare. Marketing routes are bare only for signed-out
 * visitors -- a signed-in inspector opening /pricing keeps their nav.
 */
export function hidesNavShell(pathname: string, signedIn: boolean): boolean {
  if (isPortalRoute(pathname)) return true;
  return !signedIn && isMarketingRoute(pathname);
}

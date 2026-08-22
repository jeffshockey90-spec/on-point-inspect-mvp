const PORTAL_ROUTE_PREFIXES = [
  "/client",
  "/client-portal",
  "/client-agreement",
  "/share",
  "/environmental-share",
  "/repair-request",
  "/repair-response",
  "/embed",
  "/login",
  "/signup",
];

/** True for public/portal routes that render without the app's Nav shell. */
export function isPortalRoute(pathname: string): boolean {
  return PORTAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

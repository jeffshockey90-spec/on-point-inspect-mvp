// Shared auth for /api/cron/* routes (they're under /api, which proxy.ts lets
// through without a login). With CRON_SECRET set, require it (Vercel cron sends
// "Authorization: Bearer <CRON_SECRET>"; manual runs may use x-cron-secret).
//
// Without CRON_SECRET the routes used to accept ANY request — anyone could fire
// reminder SMS / AI jobs. Refusing outright would silently stop the real cron,
// so in that case only Vercel's own scheduler (user-agent "vercel-cron/…") is
// accepted. Set CRON_SECRET in the deployment to make this strict.
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (secret) return authHeader === `Bearer ${secret}` || cronHeader === secret;
  return /vercel-cron/i.test(req.headers.get("user-agent") || "");
}

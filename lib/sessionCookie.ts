import { cookies } from "next/headers";

/**
 * Whether this request carries a Supabase session cookie.
 *
 * Deliberately checks for the cookie's PRESENCE rather than validating the
 * session. This decides one thing -- whether the app's nav shell renders -- and
 * nothing about access, so a stale or forged cookie costs at most a nav bar
 * shown to someone who then sees a signed-out page. Every route that returns
 * real data still authenticates properly.
 *
 * The cheapness is the point: the nav used to gate its render on an auth
 * round-trip, which left it dead on arrival and produced the "have to tap twice"
 * bug (see the comment in components/Nav.tsx). Reading a cookie adds no network
 * call, so the shell can be decided during the server render without bringing
 * that latency back.
 *
 * @supabase/ssr names the cookie `sb-<project-ref>-auth-token`, and chunks it
 * into `.0` / `.1` suffixes when it outgrows the size limit.
 */
export async function hasSessionCookie(): Promise<boolean> {
  try {
    const store = await cookies();
    return store
      .getAll()
      .some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
  } catch {
    // cookies() throws outside a request scope (e.g. static generation).
    return false;
  }
}

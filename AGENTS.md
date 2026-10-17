# FLOW — project guide

FLOW is a home-inspection SaaS: **Next.js 16 (App Router) + Supabase (Postgres / Auth / Storage)**, with a **Capacitor iOS app** that loads the deployed web app. Owner/primary inspector: Jeff (On Point Home Inspections). It is **multi-tenant** — never hardcode "On Point" or Jeff-specific values into shared logic.

## Before you finish ANY change
- Run **`npm run build`** — it must pass. This is the deploy gate; a type error or bad import fails the whole deploy.
- Run **`npm test`** (vitest) — it must pass. Add or update tests when you add real logic worth protecting, and when you fix a bug add a test that would have caught it.
- Run **`npm run check:colors`** if you touched styling — hardcoded hex colors are rejected; use the CSS-variable tokens.
- Keep the change **focused**: do only what was asked, match the surrounding style/naming, and don't refactor or touch unrelated files.

## Hard rules / gotchas (these have bitten before — don't repeat them)
- **`findings` has NO `inspector_id` column.** Selecting or inserting `inspector_id` on `findings` 400s the query. (Other per-inspector tables DO have it — see below.)
- **`email_logs`: the numeric inspection id goes in `inspection_id_bigint`.** `inspection_id` is a UUID column — writing a number there 400s the insert and the email vanishes from "Sent".
- **`photos` has NO `sort_order` column.** Ordering by it 400s and drops all photos/videos from the client report + PDFs.
- **Service-role writes into RLS'd per-inspector tables must stamp `inspector_id` = the acting user** (e.g. `section_checklist_selections`), or the owner's own RLS read won't see the rows. Exception: `findings` (no such column).
- **Never break no-account token client access.** Clients open reports/agreements/portals by an unguessable share token with no login. Gate the raw sequential-id path; never remove the token path or the owner/inspector bypasses.
- **New no-login routes must be added to `proxy.ts` `PUBLIC_PREFIXES`** — route protection lives in `proxy.ts`, not `middleware.ts`.
- **Every inspection payment link goes through `lib/stripeCheckout.ts`** (connected-account charge + online fee). Don't add a second checkout path.
- **Cautious report wording (liability).** Never say a component *will* fail or give a hard deadline; frame as typical service life + a maintenance caveat.
- **The DB is the single source of truth.** Store config/settings/layout server-side so it syncs cross-device (the offline capture queue is the one exception).
- **Tailwind v4 scans CSS comments and `.mjs`** — a complete class-token literal like a `bg-[var(--fl-…)]` value inside a comment 500s the app. Don't put class-token literals in comments.
- **iOS offline queue stores ArrayBuffer bytes, not Blobs** (iOS drops Blobs on restart).

## How you work here
- You implement on a branch and open a PR; **Jeff reviews the diff in-app and merges** — nothing ships without him. Write clear, reviewable diffs and a short PR summary of what changed and how you verified it (build + tests).
- **Debugging a bug:** understand it from the code (and any error/log Jeff gave you) first, state the root cause plainly, then make the smallest correct fix — and add a test where practical.
- **Read-only audit:** change nothing except the report file you were asked to write.

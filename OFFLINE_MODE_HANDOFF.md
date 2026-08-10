# Offline Mode — Handoff (read this on the Mac)

This is the running state of the **offline mode** build so you (or a fresh
Claude session on the Mac) can pick up exactly where we left off. Everything
below is on the **`offline-mode`** git branch. **Production (`main`) is untouched.**

## What's done (branch `offline-mode`, 4 commits)
1. **IndexedDB + Blob storage** (`lib/offline/`) — offline queue + read cache on
   IndexedDB storing real file blobs. Removes the old 6-photo cap and enables
   videos offline. Built alongside the old `lib/offlineSyncQueue.ts` (untouched).
2. **Unified service worker** (`public/sw.js`) — caches pages/assets/photos for
   offline; `importScripts("/push-sw.js")` so push notifications still work.
   Registered by `components/ServiceWorkerRegister.tsx` (mounted in
   `app/layout.tsx`); `PushNotificationSetup` now registers `/sw.js`.
   Fallback page: `public/offline.html`.
3. **Field tool + AI camera wired to the offline queue** (`app/field/page.tsx`,
   `components/OfflineSyncStatus.tsx`, `app/api/offline-ai-sync/route.ts`) —
   findings, unlimited photos, videos, and notes queue offline and sync on
   reconnect; AI camera now has an offline fallback; runs
   `migrateOfflineFromLocalStorage()` once on load. Online behavior unchanged.
4. **Direct-to-storage media sync** (`app/api/offline-media-upload/route.ts`,
   `lib/offline/queue.ts`) — queued media uploads straight to the
   `inspection-photos` bucket via signed upload URLs, so **large videos sync**
   past Vercel's ~4.5MB function-body limit. Backward-compatible with old
   base64-queued items.

Also already LIVE in production (main): a **performance index migration**
(`supabase/perf-indexes.sql`) — already run in Supabase; makes the app faster.

## The critical build detail (why TestFlight-as-is won't show the offline code)
`capacitor.config.ts` sets `server.url = "https://app.flowinspect.app"` — the
**production** site (main branch). A native build loads that, so it would NOT
include this branch's offline code. To test the branch on-device:

1. In **Vercel → Deployments**, find the **`offline-mode`** preview and copy its
   URL (like `on-point-inspect-mvp-git-offline-mode-<hash>.vercel.app`).
2. On the `offline-mode` branch, temporarily set `capacitor.config.ts`
   `server.url` to **that preview URL**.
3. `npx cap sync ios` → open in Xcode → build to TestFlight.
4. Run the tests below.
5. Once proven on iPhone, **merge `offline-mode` → main**; the normal config
   (pointing at `app.flowinspect.app`) then picks it up — revert the temporary
   `server.url` change before merging.

## Test plan
- **Test 1 (core):** open app WITH signal → inspection → field tool → airplane
  mode → capture findings + multiple photos + a video → watch "saved locally /
  queued" → back online → confirm sync + AI polish.
- **Test 2 (cold offline launch — the iOS unknown):** fully close app → go
  offline → reopen. Opens = service worker works on iOS. Doesn't open = we need
  the native "app-bound domains" step (see below).

## Known iOS gotcha
iOS WKWebView only runs service workers if the app declares **app-bound
domains**. If Test 2 fails, add to the iOS app: `WKAppBoundDomains` in
`Info.plist` (list `app.flowinspect.app` / the preview host) and set
`limitsNavigationsToAppBoundDomains = true` on the web view / Capacitor iOS
config. Ask Claude to walk through it.

## Still to build (after the core is proven on-device)
- **Batch review/approve queue** (Jeff's centerpiece): capture note+pics offline
  → back online, "Polish all with AI" → review each: verify section + approve, or
  edit note & re-polish → build report. No queue-size limit. (Foundation for this
  is already in place: IndexedDB queue + `run_ai_after_sync` polish.)
- Wire the **read preload cache** (`lib/offline/preload.ts`) into the field page
  so existing findings/templates render offline (queue-side is done; read-side
  still uses the old `lib/offlineInspectionPreload`).

## Continuing with Claude on the Mac
This chat is local to the Windows machine and won't appear on the Mac. Start a
fresh Claude session in the pulled repo and point it at this file. The project
memory (`~/.claude/.../memory/`) is also Windows-local; the key facts are
captured here and in the commit messages.

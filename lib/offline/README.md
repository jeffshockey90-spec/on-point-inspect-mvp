# `lib/offline` — IndexedDB offline layer

Blob-native replacement for the old localStorage offline modules. Media (photos
**and videos**) is stored as real `Blob`s instead of base64 strings, which
removes the old **6-photo-per-finding cap** and enables **offline video**.

> **Status: foundation only.** These modules are built _alongside_ the existing
> localStorage code. The old files (`lib/offlineSyncQueue.ts`,
> `lib/offlineInspectionPreload.ts`) and the `app/field/page.tsx` call sites are
> **not** yet rewired — that cutover is a later, separate step.

## Why IndexedDB

| Limitation of the old localStorage layer | How this layer fixes it |
| --- | --- |
| 6 photos per finding (hard cap) | No cap — media stored as Blobs |
| No videos (base64 videos blow the quota) | Videos supported (stored as Blobs) |
| Images stored as base64 (~33% bloat) | Raw Blob bytes, no base64 at rest |
| ~5 MB localStorage budget | IndexedDB has orders of magnitude more room |

Base64 is still produced **only at send time** (`buildSyncBody`) so the sync
endpoint `app/api/offline-ai-sync/route.ts` needs no changes.

## SSR / build safety

- Importing any module here **never** touches IndexedDB.
- The DB is opened lazily on first real use, and only when a browser +
  IndexedDB exist (`isIndexedDbAvailable()`).
- Every function no-ops (returns `[]` / `null` / `0`) on the server, during
  Next.js prerender, and in the Node build.
- Works in an iOS/Android Capacitor WebView and a browser PWA (no Node APIs).

## Files

### `db.ts` — database + shared types

Object stores in the `on-point-offline` database (version 1):

- **`queue`** (keyPath `id`) — one record per offline action. Indexes:
  `by_status`, `by_inspection` (`payload.inspection_id`), `by_createdAt`.
- **`preload`** (keyPath `inspectionId`) — per-inspection read cache. Index:
  `by_cachedAt`.
- **`meta`** — small single-value store: reports index
  (`META_REPORTS_INDEX_KEY`), migration flag (`META_MIGRATION_KEY`), last sync
  notice (`META_LAST_SYNC_NOTICE_KEY`).

Key exports: `getDb()`, `isIndexedDbAvailable()`, `deleteOfflineDb()`,
`createId()`, `mediaKindForType()`, and the `OfflineQueueRecord`,
`OfflineMediaEntry`, `CachedInspection`, `CachedInspectionPreload` types.

`OfflineMediaEntry` replaces the old `OfflinePhoto`: instead of a base64 string
it carries a real `blob: Blob` plus `kind: "image" | "video"`.

### `queue.ts` — sync queue (replaces `lib/offlineSyncQueue.ts`)

| Old (localStorage, sync) | New (IndexedDB, async) | Notes |
| --- | --- | --- |
| `getOfflineQueue()` | `getOfflineQueue()` | now `Promise`, newest-first |
| — | `getOfflineQueueCount()` | cheap count, new |
| — | `getOfflineQueueItem(id)` | fetch one, new |
| `addOfflineQueueItem({type,payload})` | `addOfflineQueueItem({type,payload,media?,id?})` | `media` is raw `File`/`Blob`s (no cap); base64 no longer passed in `payload.photos` |
| `removeOfflineQueueItem(id)` | `removeOfflineQueueItem(id)` | async |
| `clearOfflineQueue()` | `clearOfflineQueue()` | async |
| `updateOfflineQueueItem(id, fn)` | `updateOfflineQueueItem(id, fn)` | async, txn-safe |
| — | `setOfflineQueueItemStatus(id,status,extra?)` | helper, new |
| (inline in `processOfflineQueue`) | `markOfflineQueueItemFailed(id,msg)` | backoff bookkeeping extracted |
| `getOfflineQueueSummary()` | `getOfflineQueueSummary()` | async; adds `photoCount`/`videoCount` |
| `filesToOfflinePhotos(files)` → base64 | `toMediaEntry(input)` → Blob entry; `buildSyncBody(item)` → base64 at send | conversion split store-time vs send-time |
| `processOfflineQueue(cbs)` | `processOfflineQueue(cbs)` | async; converts Blob→base64 per item before POST |
| `startOfflineQueueAutoSync(opts)` | `startOfflineQueueAutoSync(opts)` | same online/focus/visibility/interval triggers |
| `isOnline()` | `isOnline()` | unchanged |

The queue item id and JSON POST body (`{ id, type, createdAt, payload:{...,
photos} }`) stay compatible with `/api/offline-ai-sync`, so its receipt-based
idempotency keeps working.

### `preload.ts` — read cache (replaces `lib/offlineInspectionPreload.ts`)

Same function names, now async and IndexedDB-backed:
`getPreloadIndex`, `savePreloadIndex`, `getCachedInspectionPreload`,
`saveInspectionPreload`, `cacheReportsForOffline`, `getCachedReportsForOffline`,
`getCachedReportById`, `getInspectionLabel`, `saveSyncCompletionNotice`,
`getLastSyncCompletionNotice`. Adds `removeInspectionPreload(id)`.

The reports index and the last-sync notice live in the `meta` store; each
inspection preload is its own record in the `preload` store (keyed by
`inspectionId`).

### `migrate.ts` — one-time localStorage → IndexedDB import

`migrateOfflineFromLocalStorage()` reads the legacy localStorage keys
(`on_point_offline_sync_queue`, `opi-offline-inspection-preload-*`,
`opi-offline-inspection-preload-index`, `opi-last-sync-notice`), converts old
base64 photos back into Blobs, and writes everything into IndexedDB. It is:

- **idempotent** — guarded by the `META_MIGRATION_KEY` flag and by per-id
  existence checks;
- **non-destructive** — localStorage is left untouched for now.

`hasMigratedOffline()` reports whether it already ran.

## Deviations from the old API (and why)

- **Everything is async.** IndexedDB has no synchronous API. Call sites will
  need `await` when they switch over.
- **`addOfflineQueueItem` takes `media` (Files/Blobs), not base64 in
  `payload.photos`.** This is the whole point — Blobs at rest, no cap, videos
  allowed. `filesToOfflinePhotos` (which capped at 6 and base64-encoded) has no
  direct equivalent; use `toMediaEntry` at store time and `buildSyncBody` at
  send time instead.
- **`getOfflineQueueSummary` adds `photoCount`/`videoCount`** and derives bytes
  from Blob sizes rather than base64 string sizes.
- **Preload caps (500) are kept** even though IndexedDB has room, to avoid a
  single record growing unbounded; loosen later if needed.

## Usage sketch (for the later cutover)

```ts
import { migrateOfflineFromLocalStorage } from "@/lib/offline/migrate";
import {
  addOfflineQueueItem,
  startOfflineQueueAutoSync,
} from "@/lib/offline/queue";

// once on app startup (client only)
await migrateOfflineFromLocalStorage();
const stop = startOfflineQueueAutoSync();

// queueing a finding with unlimited photos + a video
await addOfflineQueueItem({
  type: "finding",
  payload: { inspection_id, title, section, severity, inspector_note },
  media: files, // File[] — images and videos, any count
});
```

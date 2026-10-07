# Live Camera — Async "Draft in the Background" Design

**Status:** Design proposal (not yet built) · drafted 2026-10-06
**Goal (Jeff's idea):** After you take the picture (or take the pic + enter your note), you move on to the next item **immediately** while AI drafts in the background. When a draft finishes you get a little alert to tap → **Approve** or **Redraft**. This must work for **everything the AI drafts in the live camera, not just findings.**

---

## TL;DR — why this is very doable

This is **~70% already built.** FLOW already has:

- A **durable IndexedDB capture queue** (`lib/offline/`) that stores photo bytes as **ArrayBuffers** (survives iOS restart), uploads media straight to storage via signed URLs (no 4.5 MB body cap), retries with backoff, and is single-flight safe.
- A **server-side "generate AI after the capture syncs"** path (`generateAiFindingAfterSync` in `app/api/offline-ai-sync/route.ts`) that already runs the shared FLOW Writer and flags the row **`needs_review: true`**.
- A **review/approve queue UI** (`components/FieldReviewQueue.tsx`) mounted at the top of the report builder, with per-item **Approve**, **Approve All**, and **edit-note → re-polish**.
- **Approve / repolish API routes** (`/api/findings/approve`, `/api/findings/repolish`).
- **Verified live in the DB today:** `findings.needs_review`, `findings.offline_captured`, `offline_sync_receipts`, `ai_learning_events` all exist.

What's missing is: **(1)** stop the live camera from *blocking* on the confirm card, **(2)** generalize the review flow beyond findings (limitations, equipment, captions), **(3)** an **in-camera "draft ready" alert + pending badge** so you can approve/redraft without leaving the shutter, **(4)** preserve the **learning loop** across the async boundary, **(5)** a couple of small DB/robustness additions, and **(6)** a **beta on/off toggle** (default off) with a remote kill switch — see §7b.

The design below reuses the existing pipeline end-to-end so we touch the fragile realtime/scroll machinery as little as possible.

---

## 1. The core flow (new) — decisions locked in

Per Jeff: **(a)** don't background until the **"Analyze" (AI) button is clicked** — the fork is that tap, *not* the shutter; **(b)** after clicking, you move on to the next item immediately while it drafts; **(c)** when the AI finishes, a **clickable popup appears in the live camera** that you tap to bring the draft up for **approval**; **(d)** approve is the one-tap primary action ("always approve"), redraft/edit still available; **(e)** keep multiple pics + multiple in-flight items; **(f)** pure add-on — everything that works today still works unchanged.

```
Capture pics (multi-angle tray) + note + location   ── EXACTLY as today; nothing here changes ──
            │   (markup, category reassign, attach-to-existing, voice, etc. all unchanged)
            ▼
Tap "✨ Analyze N shots → finding / limitation / equipment"   ◄── the ONLY fork point
            │
     ┌──────┴────────────────────────────────────┐
     ▼ async beta ON                               ▼ async beta OFF (= today, untouched)
  Snapshot capture → durable IndexedDB queue       drafting spinner → CaptureConfirmCard
  (draft_pending). Return to the viewfinder         → manual accept. No change at all.
  INSTANTLY for the next item — no spinner.
            │
            ▼
  Background worker generates (strictly serial);
  you can queue SEVERAL items and keep shooting.
            │
            ▼
  AI done → a CLICKABLE POPUP appears in the live camera:
  "✓ Draft ready — tap to review: Kitchen GFCI"
  (persists; if several finish, they stack / show a count).
            │
            ▼ tap the popup, whenever you're ready (between shots)
  Brings up the draft in the confirm card (the SAME CaptureConfirmCard as today):
      ▸ Approve  → one tap, saves via the normal path (findings/limitations/equipment + photos)
      ▸ Redraft / edit  → adjust note or wording, re-run in background (optional)
            │
            ▼
  Saved to the report. Nothing is ever lost if you don't get to a popup:
  pending drafts stay in the camera popup list AND land in the builder's review queue.
```

**What does NOT change:** the whole capture experience up to the Analyze tap — multi-angle `shots[]` tray, photo markup, category switching, attach-to-existing-defect, location/compass, voice section-fill, reference photos. The async path only replaces the *blocking wait* (spinner, then you're stuck on the confirm card) with *queue-and-move-on → popup → approve when ready*.

**The speed win, precisely:** today you tap Analyze and then **wait** on the "AI is drafting…" spinner before you can do anything, every single item. With this on, tapping Analyze frees you instantly — the draft is built in the background and you approve it with one tap via the popup whenever it's convenient (between the next captures), instead of standing still watching a spinner.

**The invariant that makes it fullproof:** at the Analyze tap the capture (photo bytes + note + metadata) is written to IndexedDB **before the AI call**, and the AI result is written **back into that same record** — never only into React state. Everything *before* the Analyze tap lives in the in-memory tray, exactly as it does today (no regression — today's tray is in-memory too). From the tap onward, navigation, app-backgrounding, and a crash/kill lose nothing: on relaunch the worker rescans `draft_pending`/`generating`, resumes, and the "draft ready" popup reappears for approval.

---

## 2. What "everything, not just findings" means

Every AI output in the live camera, and how each fits the async model:

| AI path | Route | Blocks today? | Async plan |
|---|---|---|---|
| **Finding draft** | `POST /api/ai-capture` | **Yes** (full-screen "drafting") | Primary target — capture now, draft in background, approve/redraft |
| **Limitation draft** | `POST /api/ai/live-inspection-camera` (`focus:"limitation"`) | **Yes** | Same queue, `type: "limitation"` |
| **Equipment analyzer** | `POST /api/analyze-equipment` | **Yes** | Same queue, `type: "equipment"`; redraft re-sends angle photos |
| **Combine into existing defect** (AI rewrite) | `POST /api/findings/combine-capture` | Awaited in save | Background the rewrite; show "merged draft ready" for approve |
| **Voice section-fill** | `POST /api/ai/voice-section-fill` | Minor (mic-busy only) | Already effectively async; fold its result into the same "draft ready" alert for consistency |
| **Section-info material autofill** | `POST /api/ai/section-materials` | No (fire-and-forget) | Already async; surface in the alert so the inspector can see/undo what it filled |
| **Reference photo caption** | *(none today)* | — | *New*: optional AI caption drafter, same approve/redraft treatment |
| **Learning loop** | `POST /api/ai/learning` | No (fire-and-forget) | Must be re-wired to fire at **approve** time (see §5) |

The unifying idea: **one "AI draft" concept** with a `kind` tag (`finding | limitation | equipment | combine | voice | section_info | caption`). The queue, the alert, the approve/redraft actions, and the learning record all key off `kind`, so adding a new AI output later is just a new `kind`, not a new pipeline.

---

## 3. Data model

### 3a. IndexedDB queue record (extend `lib/offline/db.ts`, no new store)

Add generation lifecycle to the existing `queue` store rather than inventing a new one:

- Extend `OfflineQueueStatus` with: `draft_pending → generating → needs_review → approved` (keep existing `queued | syncing | failed | conflict`). Reuse the `by_status` index for the worker scan.
- Add a `draft` field on the record to hold the AI output once generated.
- Add `ai_baseline` on the record = the **first** AI draft, pinned at generation time (critical for learning — see §5).
- Add `kind` (the AI type above) and `nudges: string[]` (redraft instructions, accumulated).
- `media` already stores ArrayBuffers — unchanged. Keep full-res bytes **on disk only**; shrink to a 1600px AI frame per request; never hold more than one job's full-res bytes decoded at once.

### 3b. Server / DB

- **Reuse** `findings.needs_review` + `findings.offline_captured` (both live). A finding that was drafted async lands with `needs_review: true` and renders in `FieldReviewQueue`.
- **Add migration:** `findings.ai_review_required` is **missing** in the live DB but `generateAiFindingAfterSync` writes it — add the column (or stop writing it). Flag: this is a latent bug today for the offline after-sync path.
- **Generalize `needs_review` beyond findings.** Add the same `needs_review` concept to `limitations` and `equipment` so the queue can hold all kinds. (Simplest: a nullable `needs_review boolean default false` on each, mirrored exactly like `findings-review.sql`.)
- **Persist the AI baseline for later learning.** Store the first AI draft with the row (a `ai_prediction jsonb` column on `findings`, or an `ai_learning_pending` row keyed by finding id) so the approve step can still compute the before/after diff *after* the in-memory baseline is gone. **This is the #1 learning-loop regression risk if skipped.**

---

## 4. Execution model — two layers, sequenced

The agents converged on: ship the **client-triggered worker first** (fast, ~90% assembled), then add the **server-side job** for true background survival.

### Layer 1 — In-page draft worker (v1, the "feels instant in-session" path)
A loop modeled exactly on the existing `startOfflineQueueAutoSync()` (`lib/offline/queue.ts:674`):
- Picks the oldest `draft_pending` item, sets `generating`, calls the AI route for its `kind`, writes the result back into the IndexedDB record as `needs_review` + `draft`.
- **Strictly serial** — reuse the existing `processingQueue` + `sessionStorage` single-flight lock so two drafts never decode full-res photos simultaneously (the known iOS memory crash).
- Runs while the session is alive and foregrounded. If the app is backgrounded mid-draft, the item simply stays `generating`/`draft_pending` and is retried on foreground (idempotent via `offline_sync_receipts`).

### Layer 2 — Server-side generation (v2, "batch polish all" + survives app kill)
Already exists in skeleton: queue uploads the capture (bytes → storage path), the **server** runs `generateAiFindingAfterSync` and writes the finding `needs_review: true`. This is the *only* model where generation keeps going when the WebView is dead/backgrounded. It directly delivers the **"capture note+pic fast, AI-polish all when back online"** workflow from the `offline-batch-polish-queue` memory.

**Recommendation:** v1 covers the stated UX ("keep working while it drafts") within an active inspection. v2 is the robustness + batch-polish upgrade. Both route generation through `lib/ai/flowWriter.ts` via `loadFlowWriter`/`loadFlowStyle` — **do not inline new prompts** (the `flow-writer` HARD RULE), so voice/learning/few-shot stay identical whether a draft runs client- or server-side.

### iOS robustness additions (both layers)
- **Add a Capacitor `App.appStateChange` listener** that forces `processOfflineQueue()` + the draft worker on foreground. Today resume relies only on web `focus`/`visibilitychange` refiring — a real gap for native.
- Keep the existing **"skip an unrecoverable photo but still save the text"** behavior (`queue.ts:149`). Never let one bad media entry wedge the queue.
- Preserve the **crash breadcrumb logger** (`lib/liveCameraLog.ts`) and add breadcrumbs for draft enqueue / generate-start / generate-done so a field crash during async drafting is diagnosable.

---

## 5. Keeping the learning loop intact (critical)

Today the per-inspector "learning brain" learns from **first-AI-draft → what you accepted** (`/api/ai/learning` → `LearningEngine.record` → `getPatterns` → injected into every FLOW Writer prompt). The async boundary breaks this unless we handle it deliberately:

1. **Pin the baseline at draft time, persist it with the record.** You approve *later*, by which point the in-memory `aiFindingBaselineRef` is gone. Store the first AI draft on the record (§3b) so approve can still diff.
2. **Approve = record `{accepted:true, original:baseline, inspector:finalValues}`.** Wire this into `/api/findings/approve` (it does **not** emit learning today — only the old inline paths do). Approve is now the real "accept" gesture, so it's the right home.
3. **Redraft-with-a-nudge is a NEW, high-value signal.** When you tap Redraft and type "make it less alarmist" / "it's the north wall", record `{accepted:false, notes:<nudge>}`, then when you approve the redraft, record the cumulative first→approved delta. Nudges are exactly the correction signal `getPatterns` mines for phrasing / severity / section routing — and nothing captures them today.
4. **Tag `tool`/`suggestionType` per kind** (`live_camera`, `equipment`, `voice_fill`, `caption`, `section_info`) so the currently-empty accepted/ignored-suggestion buckets finally populate.

---

## 6. The approval popup + where pending drafts live

The **in-camera popup is the primary approval surface** — exactly what Jeff asked for: "the popup should appear to click in the live camera once the AI is finished so we can click to bring it up for approval." One source of truth (the IndexedDB record / DB `needs_review`), three views of it:

1. **In-camera "draft ready" popup (primary).** Reuse the **voice-fill floating panel** pattern (`AILiveInspectionCamera.tsx:1920`) + the `toast` system. When a background draft finishes, a persistent, tappable card appears over the live view: **"✓ Draft ready — tap to review: Kitchen GFCI."** If several finish, they **stack / show a count** ("3 drafts ready"). It does **not** interrupt the viewfinder — you tap it when you're ready, between shots.
2. **Tap → the existing confirm card.** Tapping the popup brings up the draft in the **same `CaptureConfirmCard`** used today (full editor: title/section/severity/O-I-R, equipment intelligence, section-info toggles). **Approve = one tap** (the primary action; this is the "always approve" part) → saves via the normal path (`handleCameraAccept` → `findings`/`limitations`/`equipment` + `photos`). **Redraft / edit** is right there too (adjust the note/wording → re-run in the background) but is optional, not required.
3. **Didn't get to it? The builder review queue catches it.** `FieldReviewQueue` already renders at the top of the report builder with Approve / Approve All / edit-note → redraft. Any draft you don't approve in-camera (e.g. you left the field tool) stays `needs_review:true` and shows up there — same data, approve from either place. **Failed** drafts (AI errored after retries) land here too, with photos + note intact, so nothing is ever lost or silently dropped.

**Nothing is lost if a popup is missed (Option A, decided):** pending drafts persist in the IndexedDB queue → the popup list reappears next time the camera opens, and they always sit in the builder's review queue awaiting approval. **A draft never enters the report without an explicit approve tap** — no auto-approve on publish. If a report is published with drafts still pending, show a "N drafts still awaiting approval" notice rather than silently including or dropping them.

**Cross-surface count (optional):** the Command Center / `InspectorToolsDrawer` already models a `WorkspaceNotification` with jump-to-finding routing — a "N drafts awaiting approval" count fits with near-zero plumbing, derived from the **DB `needs_review`** flag (not localStorage — the `ai-review-persistence` iOS bug).

Use the existing event bus (`opi:findings-changed`, `opi:checklist-updated`, `opi:inspection-data-changed`) so an open builder reveals an approved draft without a hard reload.

Use the existing event bus (`opi:findings-changed`, `opi:checklist-updated`, `opi:inspection-data-changed`) so an open builder reveals an auto-saved draft without a hard reload. The Command Center count (`InspectorToolsDrawer`) is optional and, if used, should show only the *failed/needs-attention* count, derived from the DB flag (not localStorage — the `ai-review-persistence` iOS bug).

---

## 7. Integration risks & how we avoid them

- **Realtime scroll-jump.** `RealtimeReportSync` does a debounced `refreshKeepScroll` on any `findings` change, suppressing the local device's echo for only 2.5s (`lib/localEditSignal.ts`). A background draft that lands >2.5s after your last edit on the *same* device that has the builder open could trigger a mid-scroll refresh. **Mitigation:** call `markLocalEdit()` when a draft lands, and land drafts as `needs_review:true` so they render in the **stable top-of-page `FieldReviewQueue` region**, not inserted mid-list.
- **Never collapse sections on refresh** (the HARD RULE behind the scroll-to-bottom glitch). `FieldReviewQueue` already sidesteps this by being its own top region with optimistic client-side removal — keep drafts flowing through it.
- **Double-render.** `needs_review` findings are currently a *filter* of the editor list and may render both in the queue and in their section. Decide: exclude `needs_review` from the main list until approved, **or** render them visibly "pending" in place. Matters once live drafts flow at volume.
- **Media integrity (iOS).** Store bytes as **ArrayBuffer, never Blob** (the `ios-indexeddb-blob-gotcha` HARD RULE). Already handled by `toMediaEntry`; the async feature must not regress it.
- **inspector_id / RLS.** Server-side (service-role) writes must stamp `inspector_id` = acting user, same lesson as the recent voice/section-info fix, or the owner's RLS'd builder read won't see the draft. (The after-sync path already attributes correctly — verify any new kind does too.)

---

## 7b. Beta toggle — ship it behind an on/off switch

This is a field-critical workflow change, so it ships **behind a toggle, default OFF during beta.** The current synchronous confirm-card flow stays the default and is completely untouched; turning the toggle on opts an inspector into the async path.

**Two layers of control:**

1. **Per-inspector setting (DB-backed, cross-device).** A `profiles.async_draft_enabled boolean default false` (per the single-source-of-truth rule — never device-only localStorage). Surfaced as **Settings › Live Camera › "Background AI drafting (beta)"** with a one-line explainer. Because it's in the DB it follows the inspector across their phone/iPad/desktop. Optionally mirror a quick toggle in the field tool header so they can flip it without leaving the camera.

2. **Server-side remote kill switch (owner-level).** A global flag (reuse the existing global-config pattern, e.g. a `feature_flags` / subscription-pricing-style row) that Jeff can flip to **force the feature off for all beta users instantly** — no App Store release needed, because the iOS app is a remote WebView that reads the flag on load. Resolution order: `global kill switch OFF → feature disabled for everyone`; otherwise `per-inspector async_draft_enabled` decides. Fail-safe default on any read error = **OFF** (synchronous flow), so a flag-fetch failure can never strand the inspector in a half-built experience.

**The branch point is a single clean fork** at capture-accept time in `AILiveInspectionCamera` / `handleCameraAccept`:
- `asyncDraftEnabled === true` → persist capture (`draft_pending`), return to viewfinder, draft in background.
- else → today's exact flow: `runDraft` → `drafting` spinner → `CaptureConfirmCard`. Zero behavior change.

**Flipping the toggle mid-inspection must be safe:**
- **On → Off:** any already-`draft_pending`/`generating` items **still finish and land in the review queue** (never orphaned/lost); only *new* captures use the synchronous path. The pending badge/queue remains visible until those drafts are approved.
- **Off → On:** takes effect on the next capture; nothing to migrate.
- The IndexedDB queue is the same store either way, so no data is stranded by a flip in either direction.

**Beta-quality guardrails to pair with the toggle:** a visible "Beta" tag on the toggle and on the in-camera pending panel; the crash-breadcrumb logger extended to tag async-draft events so field issues are diagnosable; and the per-inspector flag doubles as the beta cohort (start with Jeff, expand).

## 8. Suggested build phases

**Phase 0 — DB prep + beta toggle (small):** add `profiles.async_draft_enabled` (default false) + the global kill switch + the Settings toggle and the fork at capture-accept (fail-safe OFF); add `findings.ai_review_required` (fixes a latent after-sync bug); add `needs_review` to `limitations` + `equipment`; add `ai_prediction`/baseline storage. Verify `inspector_id` stamping on all async write paths. Shipping the toggle first means every later phase lands dark behind an off-by-default switch.

**Phase 1 — Findings async (the headline):**
- At the **Analyze tap**, enqueue the capture + note immediately (`draft_pending`, `confirmed_live:false`) and return to the viewfinder — no spinner.
- In-page draft worker generates → writes back `needs_review` + `draft` + `ai_baseline`.
- **Clickable "draft ready" popup** in the live camera (voice-fill panel pattern), stacking a count when several finish → tap opens the draft in the **existing `CaptureConfirmCard`** → **Approve** (one tap) saves; redraft/edit optional.
- Wire the approve action to emit the learning event (`/api/findings/approve`); redraft reuses `adjust-finding-tone` (wording nudge) / `repolish`-style re-draft (substantive).
- `FieldReviewQueue` relabel + catches any un-approved/failed drafts.

**Phase 2 — Limitations + Equipment + Combine:** same queue, new `kind`s; generalize `FieldReviewQueue`.

**Phase 3 — Server-side generation + "Polish all":** extend the offline after-sync path to the full batch-polish UI; add the Capacitor `App.appStateChange` drain. Delivers true background survival + the offline batch workflow.

**Phase 4 — Reference captions + Command Center count + learning `suggestionType` tagging.**

---

## 9. Decisions (locked) + one remaining question

**Locked in from Jeff:**
- ✅ **Don't background until the AI/Analyze button is clicked** — the fork is that tap, not the shutter.
- ✅ **Move on immediately after Analyze** — no spinner, straight back to the viewfinder for the next item.
- ✅ **A clickable popup appears in the live camera when the AI finishes** — tap it to bring the draft up for approval.
- ✅ **Approve is one tap ("always approve")**; redraft/edit is available but optional.
- ✅ **Multiple pics + multiple in-flight items** preserved; everything that works today is unchanged — this is purely an additive speed layer behind the beta toggle.

**Also decided:**
- ✅ **Forgotten-popup safety net = Option A.** An un-approved draft **waits in the builder's review queue** (`FieldReviewQueue`, `needs_review:true`) until the inspector approves it. **No auto-approve on publish** — a draft never enters the report without an explicit tap. (If a report is published with drafts still pending, surface a clear "N drafts still awaiting approval" notice rather than silently including or dropping them.)

Nothing left open — ready to build.

---

### Appendix — key files
- `lib/offline/db.ts`, `lib/offline/queue.ts` — durable IndexedDB queue (schema, ArrayBuffer handling, single-flight, backoff, completion events)
- `app/api/offline-ai-sync/route.ts` — server AI-after-sync, `needs_review` flagging, receipt idempotency, the `confirmed_live` gate (~`:584`)
- `components/FieldReviewQueue.tsx` — existing approve/redraft queue UI
- `app/api/findings/approve/route.ts`, `app/api/findings/repolish/route.ts` — approve + server redraft
- `components/AILiveInspectionCamera.tsx` — stage machine, `runDraft`, `handleAccept`, `handleRegenerate`, voice-fill panel + toast
- `app/field/page.tsx` — `handleCameraAccept`, durable enqueue, `queueTick` auto-sync wiring
- `lib/ai/flowWriter.ts` — shared writer core (extend, never inline prompts)
- `lib/ai/LearningEngine.ts`, `lib/ai/findingRetrieval.ts` — learning loop + few-shot
- `components/FindingToneControl.tsx` + `/api/adjust-finding-tone` — existing free-text "nudge" regenerate to reuse
- `components/RealtimeReportSync.tsx`, `lib/localEditSignal.ts` — realtime refresh + echo suppression to not fight
- `components/InspectorToolsDrawer.tsx` — Command Center notification/badge model
- `supabase/findings-review.sql` — `needs_review` / `offline_captured` columns

// Live-camera recovery rules for phone-call interruptions.
//
// On iOS a phone call takes the microphone. If the camera stream was opened
// with audio, the OS interrupts the WHOLE capture session — the video track
// goes muted and the preview turns black while the app is still on screen
// (no visibility change, so the background/foreground recovery never runs).
// The camera re-opens video-only in that case; these limits stop it from
// looping if the OS keeps interrupting.

export const RECOVERY_WINDOW_MS = 30_000;
export const MAX_RECOVERIES_PER_WINDOW = 3;
/** How long a track may stay muted before we treat the preview as dead. */
export const MUTED_GRACE_MS = 900;
/** How long after starting the preview must show frames. */
export const BLACK_FRAME_CHECK_MS = 2500;

/** Prune old attempts and say whether another recovery is allowed now. */
export function allowRecovery(attempts: number[], now: number): { allowed: boolean; attempts: number[] } {
  const recent = attempts.filter((t) => now - t < RECOVERY_WINDOW_MS);
  if (recent.length >= MAX_RECOVERIES_PER_WINDOW) return { allowed: false, attempts: recent };
  return { allowed: true, attempts: [...recent, now] };
}

export const CALL_INTERRUPTED_MESSAGE =
  "The camera was paused by a phone call or another app. Tap Retry camera to bring it back.";

// Tracks when THIS device last made a local edit to a report, so the realtime
// cross-device sync can tell its own database echo apart from a genuine change
// made on another device.
//
// The DB stays the single source of truth: local edits still persist normally
// and other devices still receive the realtime change and refresh. This only
// stops the EDITING device from refreshing itself on the echo of its own save
// (which it has already reflected on screen), which is what caused the
// "it reloads/jumps a beat after I make a change" feeling.

let lastLocalEditAt = 0;

export function markLocalEdit() {
  lastLocalEditAt = Date.now();
}

export function wasRecentLocalEdit(withinMs = 2500) {
  return Date.now() - lastLocalEditAt < withinMs;
}

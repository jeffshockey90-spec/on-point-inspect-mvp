// router.refresh() re-renders the (heavy) report builder from the server, which
// loses your scroll position — editing/deleting/combining a finding then bounces
// you away (often to the very bottom). This keeps you exactly where you were.
//
// Key ideas that make it actually hold (learned the hard way):
//   1. ANCHOR to a real element near the top of your viewport, not an absolute
//      scrollY. Absolute Y breaks the instant content above/below changes height
//      (a delete/combine shrinks the page) and clamps you to the bottom. Nudging
//      a specific element back to its old offset survives height changes and can
//      never over-scroll to the bottom (scrollBy is relative).
//   2. DON'T bail on keydown — you're often typing the edit itself, and a
//      keystroke would cancel the restore. Only real scroll GESTURES (wheel /
//      touchmove) mean "I'm taking over, stop chasing."
//   3. Re-apply across a longer window, because the server re-render can land
//      hundreds of ms later.
export function refreshKeepScroll(router: { refresh: () => void }) {
  if (typeof window === "undefined") {
    router.refresh();
    return;
  }

  const y = window.scrollY;

  // Pick the id'd element closest below the top of the viewport as the anchor,
  // and remember how far below the top it sat. After the refresh we put it back
  // at that same offset.
  let anchorId: string | null = null;
  let anchorOffset = 0;
  try {
    const els = document.querySelectorAll<HTMLElement>("[id]");
    let bestTop = Number.POSITIVE_INFINITY;
    for (const el of els) {
      if (!el.id) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) continue;
      // Visible and at/below the top edge — prefer the one nearest the top.
      if (rect.top >= -4 && rect.top < window.innerHeight && rect.top < bestTop) {
        bestTop = rect.top;
        anchorId = el.id;
        anchorOffset = rect.top;
      }
    }
  } catch {
    /* fall back to absolute Y below */
  }

  let cancelled = false;
  const timers: number[] = [];

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchmove", stop);
  };

  const restore = () => {
    if (cancelled) return;
    if (anchorId) {
      const el = document.getElementById(anchorId);
      if (el) {
        const delta = el.getBoundingClientRect().top - anchorOffset;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
        return;
      }
      // Anchor was removed (e.g. you deleted that finding) — fall through to Y,
      // clamped so it never lands past the (possibly shorter) page bottom.
    }
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(y, max), behavior: "auto" });
  };

  // Stop chasing only when the user actually scrolls (a gesture, not typing).
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchmove", stop, { passive: true });

  router.refresh();

  requestAnimationFrame(restore);
  for (const delay of [40, 90, 160, 260, 380, 520, 700, 900, 1150, 1450, 1800]) {
    timers.push(window.setTimeout(restore, delay));
  }
  timers.push(window.setTimeout(stop, 2000));
}

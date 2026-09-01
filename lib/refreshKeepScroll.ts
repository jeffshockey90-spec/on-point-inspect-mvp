// router.refresh() re-renders the (heavy) report builder from the server, which
// can jump the scroll position -- editing/deleting a finding then bounces you
// away from where you were. This wraps refresh so your scroll position is
// restored after the re-render paints, letting you keep working in place.
//
// router.refresh() is ASYNC: the new server-rendered content (and, after a
// delete, the shorter reflow) can land well after a couple hundred ms. A single
// short restore fires before that content arrives, so it "works" for edits but
// still jumps on delete. So we re-apply the saved position across a longer
// window -- and bail the moment the user scrolls themselves, so we never fight
// them.
export function refreshKeepScroll(router: { refresh: () => void }) {
  if (typeof window === "undefined") {
    router.refresh();
    return;
  }

  const y = window.scrollY;
  let cancelled = false;
  const timers: number[] = [];

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchmove", stop);
    window.removeEventListener("keydown", stop);
  };

  // The refresh briefly collapses the (heavy) report DOM, so the page gets
  // SHORT for a moment. Calling scrollTo(oldY) during that window clamps to the
  // bottom of the shrunken page — which is exactly the "it jumps me to the
  // bottom" bug. So only restore once the page is tall enough to actually hold
  // the saved position; skip the attempt otherwise and let a later tick catch it.
  const maxScrollNow = () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const restore = () => {
    if (cancelled) return;
    if (maxScrollNow() >= y - 4) window.scrollTo({ top: y, behavior: "auto" });
  };

  // Stop chasing the position as soon as the user takes over.
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchmove", stop, { passive: true });
  window.addEventListener("keydown", stop);

  router.refresh();

  requestAnimationFrame(restore);
  for (const delay of [50, 120, 220, 350, 500, 700, 950, 1250]) {
    timers.push(window.setTimeout(restore, delay));
  }
  // Clean up the listeners once the restore window closes.
  timers.push(window.setTimeout(stop, 1400));
}

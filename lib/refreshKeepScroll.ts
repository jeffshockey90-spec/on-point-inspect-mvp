// router.refresh() re-renders the (heavy) report builder from the server, which
// can jump the scroll position -- editing/deleting a finding then bounces you
// away from where you were. This wraps refresh so your scroll position is
// restored right after the re-render paints, letting you keep working in place.
export function refreshKeepScroll(router: { refresh: () => void }) {
  if (typeof window === "undefined") {
    router.refresh();
    return;
  }

  const y = window.scrollY;
  router.refresh();

  const restore = () => window.scrollTo({ top: y, behavior: "auto" });
  requestAnimationFrame(restore);
  window.setTimeout(restore, 100);
  window.setTimeout(restore, 250);
}

// Open every closed <details> around an element so jumping to it actually
// shows it — e.g. the Publish Guard now lives in the builder's closed
// "AI & Insights" drawer. Safe to call on anything (no-op when nothing is closed).
export function openClosedAncestors(element: Element | null | undefined): void {
  let node: Element | null | undefined = element;
  while (node) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true;
    node = node.parentElement;
  }
}

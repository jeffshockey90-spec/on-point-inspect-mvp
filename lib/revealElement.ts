// Make an element visible before jumping to it: open every closed <details>
// around it (e.g. the builder's "More" and "AI & Insights" sections) and, if
// it sits in a hidden report-builder tab panel (Agreement, Payment, …), switch
// to that tab. Safe to call on anything — a no-op when nothing is hidden.
export function openClosedAncestors(element: Element | null | undefined): void {
  let node: Element | null | undefined = element;
  while (node) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true;
    if (node instanceof HTMLElement && node.hidden && node.id && typeof window !== "undefined") {
      const reveal = (window as any).__revealReportBuilderTab;
      if (typeof reveal === "function") reveal(node.id);
    }
    node = node.parentElement;
  }
}

"use client";

import { useEffect } from "react";

// Translates the fixed UI "chrome" labels (buttons, tabs, headers) in place by
// EXACT full-text match against a curated dictionary. It never touches partial
// text or anything not in the dictionary, so inspection content (already
// translated server-side) and dynamic values are left alone. Re-applies on DOM
// changes (e.g. switching report tabs) via a MutationObserver.
export default function UiAutoTranslate({ map }: { map: Record<string, string> }) {
  useEffect(() => {
    if (!map || typeof document === "undefined") return;

    // Lowercase + collapse whitespace for case/spacing-insensitive keys.
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const dict = new Map<string, string>();
    for (const [k, v] of Object.entries(map)) {
      const nk = norm(k);
      if (nk && v && nk !== norm(v)) dict.set(nk, v);
    }
    if (!dict.size) return;

    const translateText = (node: Text) => {
      const raw = node.nodeValue || "";
      const trimmed = raw.trim();
      if (!trimmed) return;

      let hit = dict.get(norm(trimmed));
      let prefix = "";
      // Handle a leading emoji/symbol prefix (e.g. "⬇ Download Report",
      // "🏠 Home Maintenance Hub"). UI labels are English, so the core starts at
      // the first ASCII letter — split there (avoids \p{L}, which the client
      // bundle transpiles inconsistently).
      if (!hit) {
        const idx = trimmed.search(/[A-Za-z]/);
        if (idx > 0) {
          const core = trimmed.slice(idx).trim();
          const h = dict.get(norm(core));
          if (h) {
            hit = h;
            prefix = trimmed.slice(0, idx);
          }
        }
      }
      if (hit) {
        const replacement = prefix + hit;
        if (replacement !== trimmed) node.nodeValue = raw.replace(trimmed, replacement);
      }
    };

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateText(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const el = root as Element;
      // Skip form controls and editable regions.
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") return;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      let cur = tw.nextNode();
      while (cur) {
        texts.push(cur as Text);
        cur = tw.nextNode();
      }
      texts.forEach(translateText);
    };

    const container = document.querySelector("main") || document.body;
    if (!container) return;
    walk(container);

    // Re-translate nodes React re-renders (tab switches, accordions). Observing
    // childList only (not characterData) means our own nodeValue writes never
    // retrigger the observer, so there's no loop.
    let scheduled = false;
    const obs = new MutationObserver((mutations) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        for (const m of mutations) {
          m.addedNodes.forEach((n) => walk(n));
        }
      });
    });
    obs.observe(container, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [map]);

  return null;
}

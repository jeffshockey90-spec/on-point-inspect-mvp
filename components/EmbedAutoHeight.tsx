"use client";

import { useEffect } from "react";

// Posts the widget's content height to the parent window so the host page's
// snippet can size the <iframe> to fit (no inner scrollbar). Paired with the
// resize listener in the copy-paste embed snippet.
export default function EmbedAutoHeight() {
  useEffect(() => {
    const post = () => {
      const height =
        document.documentElement.scrollHeight || document.body.scrollHeight || 0;
      try {
        window.parent?.postMessage({ type: "flow-embed-height", height }, "*");
      } catch {
        /* cross-origin parent may reject; ignore */
      }
    };

    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    window.addEventListener("load", post);
    // Catch late layout shifts (fonts, async form steps) for a short window.
    const interval = window.setInterval(post, 750);
    const stop = window.setTimeout(() => window.clearInterval(interval), 10000);

    return () => {
      ro.disconnect();
      window.removeEventListener("load", post);
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, []);

  return null;
}

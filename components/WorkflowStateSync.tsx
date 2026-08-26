"use client";

// Background mirror for the report-review workflow marks that used to live only
// in localStorage (section-review completion + fingerprints, Command Center
// reviewed-findings set, per-finding quick status). localStorage stays the
// instant source — the report components are UNCHANGED and read/write it exactly
// as before, so there's no added latency. This component only:
//   • on mount: pulls the saved marks from the DB and merges them into
//     localStorage (so another device's marks show up on the next load), and
//   • on page-hide / interval: uploads the current marks to the DB.
// Nothing here touches the AI camera / field tool / capture path.

import { useEffect } from "react";

const PREFIXES = [
  "opi-command-center-reviewed-findings",
  "opi-finding-quick-status-",
  "opi-ai-section-review-complete-",
  "opi-ai-section-review-fingerprints-",
];

function matches(key: string) {
  return PREFIXES.some((p) => key === p || key.startsWith(p));
}

function collectLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && matches(k)) {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = v;
      }
    }
  } catch {
    /* private mode / disabled storage — no-op */
  }
  return out;
}

// Merge the server blob into localStorage: union arrays, shallow-merge objects,
// and fill in keys this device is missing. Local wins on scalar conflicts.
function mergeIntoLocal(blob: Record<string, any>) {
  for (const [k, raw] of Object.entries(blob || {})) {
    if (!matches(k) || typeof raw !== "string") continue;
    try {
      const existing = localStorage.getItem(k);
      if (existing == null) {
        localStorage.setItem(k, raw);
        continue;
      }
      try {
        const a = JSON.parse(existing);
        const b = JSON.parse(raw);
        if (Array.isArray(a) && Array.isArray(b)) {
          localStorage.setItem(k, JSON.stringify(Array.from(new Set([...b, ...a]))));
        } else if (a && b && typeof a === "object" && typeof b === "object") {
          localStorage.setItem(k, JSON.stringify({ ...b, ...a }));
        }
        // otherwise keep the local scalar as-is
      } catch {
        /* non-JSON value — keep local */
      }
    } catch {
      /* storage error — skip this key */
    }
  }
}

export default function WorkflowStateSync() {
  useEffect(() => {
    let cancelled = false;

    // Hydrate from the DB (best-effort).
    fetch("/api/settings/workflow-state", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.state) mergeIntoLocal(d.state);
      })
      .catch(() => {});

    const upload = () => {
      const state = collectLocal();
      if (Object.keys(state).length === 0) return;
      try {
        // keepalive lets the POST complete even as the page is unloading.
        void fetch("/api/settings/workflow-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    };

    const onHide = () => {
      if (document.visibilityState === "hidden") upload();
    };

    const interval = window.setInterval(upload, 60_000);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", upload);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", upload);
      upload();
    };
  }, []);

  return null;
}

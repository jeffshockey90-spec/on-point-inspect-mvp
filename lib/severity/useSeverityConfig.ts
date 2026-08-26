"use client";

// Client hook for the logged-in inspector's company severity config. Fetches
// /api/severity-settings once (module-cached + in-flight dedupe) and returns
// the config, falling back to defaults until loaded so nothing ever renders
// blank. For no-login surfaces (client share report, PDF) load server-side via
// loadSeverityConfigForInspection instead.

import { useEffect, useState } from "react";
import { DEFAULT_SEVERITY_CONFIG, normalizeSeverityConfig, type SeverityConfig } from "./severityConfig";

let cache: SeverityConfig | null = null;
let inflight: Promise<SeverityConfig> | null = null;

function fetchConfig(): Promise<SeverityConfig> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/severity-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => normalizeSeverityConfig(d?.config))
      .catch(() => DEFAULT_SEVERITY_CONFIG)
      .then((c) => {
        cache = c;
        inflight = null;
        return c;
      });
  }
  return inflight;
}

export function useSeverityConfig(): SeverityConfig {
  const [config, setConfig] = useState<SeverityConfig>(cache || DEFAULT_SEVERITY_CONFIG);
  useEffect(() => {
    let mounted = true;
    fetchConfig().then((c) => {
      if (mounted) setConfig(c);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return config;
}
